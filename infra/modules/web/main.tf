# OncoBrief web tier (ADR 0016).
#
# The Next.js application connects **directly to the private RDS instance** (it
# is a full-stack server app, not an API client of API Gateway), so it must run
# inside the VPC. This module builds:
#
#   Internet -> CloudFront (HTTPS, AWS-owned certificate)
#            -> ALB (public, HTTP:80, reachable only from CloudFront)
#            -> ECS Fargate (private subnets) -> private RDS
#
# HTTPS without a customer domain: CloudFront terminates TLS with the
# `*.cloudfront.net` default certificate, so the submission URL is a genuine
# HTTPS endpoint (see docs/final-submission-verification.md). A customer domain
# would replace the CloudFront distribution with an ACM certificate + ALB:443,
# needing only `aliases` and `viewer_certificate` changes here.
#
# Secrets (DB URL, cookie secret, S3 keys) live in Secrets Manager and are
# injected as container secrets, never baked into the image or the frontend.

variable "name_prefix" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "container_port" {
  type    = number
  default = 3000
}
variable "image_tag" {
  type    = string
  default = "latest"
}
variable "task_cpu" {
  type    = number
  default = 512
}
variable "task_memory" {
  type    = number
  default = 1024
}
variable "db_host" { type = string }
variable "db_port" { type = number }
variable "db_name" { type = string }
variable "db_user" {
  type    = string
  default = "oncobrief_app"
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "bucket_name" { type = string }
variable "bucket_arn" { type = string }
variable "kms_key_arn" { type = string }
variable "cognito_region" {
  type    = string
  default = ""
}
variable "cognito_user_pool_id" {
  type    = string
  default = ""
}
variable "cognito_client_id" {
  type    = string
  default = ""
}
variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_200"
}
# Non-secret runtime configuration (storage driver, extraction driver, demo
# mode, feature flags). Secrets are added by the module itself.
variable "environment" {
  type    = map(string)
  default = {}
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# --- container registry ------------------------------------------------------
resource "aws_ecr_repository" "web" {
  name                 = "${var.name_prefix}-web"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.name_prefix}-web"
  retention_in_days = 14
}

# --- secrets -----------------------------------------------------------------
# The session cookie secret is generated here and never appears in source.
resource "random_password" "session" {
  length  = 48
  special = false
}

# Programmatic credentials for the web tier's S3 access. The storage adapter
# signs requests with static credentials (packages/adapters/src/s3-storage.ts),
# so a scoped IAM user's keys are stored in Secrets Manager rather than given a
# task role. Hardening: teach the adapter the container credential provider and
# drop the user (documented in docs/final-submission-verification.md).
resource "aws_iam_user" "web_storage" {
  name = "${var.name_prefix}-web-storage"
}

data "aws_iam_policy_document" "web_storage" {
  statement {
    sid       = "DocumentsReadWrite"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:GetObjectVersion"]
    resources = ["${var.bucket_arn}/*"]
  }
  statement {
    sid       = "DocumentsList"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [var.bucket_arn]
  }
  statement {
    sid       = "KmsForS3"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_user_policy" "web_storage" {
  name   = "${var.name_prefix}-web-storage"
  user   = aws_iam_user.web_storage.name
  policy = data.aws_iam_policy_document.web_storage.json
}

resource "aws_iam_access_key" "web_storage" {
  user = aws_iam_user.web_storage.name
}

resource "aws_secretsmanager_secret" "web" {
  name                    = "${var.name_prefix}-web"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "web" {
  secret_id = aws_secretsmanager_secret.web.id
  secret_string = jsonencode({
    DATABASE_URL                 = "postgres://${var.db_user}:${var.db_password}@${var.db_host}:${var.db_port}/${var.db_name}?sslmode=require"
    SESSION_COOKIE_SECRET        = random_password.session.result
    STORAGE_S3_ACCESS_KEY_ID     = aws_iam_access_key.web_storage.id
    STORAGE_S3_SECRET_ACCESS_KEY = aws_iam_access_key.web_storage.secret
  })
}

# --- IAM for ECS -------------------------------------------------------------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-web-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadWebSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.web.arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name_prefix}-web-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# --- security groups ---------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-web-alb"
  description = "OncoBrief ALB: HTTP from CloudFront only."
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from CloudFront origin-facing ranges"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    description = "Forward to the web tasks"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "web" {
  name        = "${var.name_prefix}-web-tasks"
  description = "OncoBrief web tasks: inbound only from the ALB; egress to RDS and AWS APIs."
  vpc_id      = var.vpc_id

  ingress {
    description     = "Application port from the ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- load balancer -----------------------------------------------------------
resource "aws_lb" "web" {
  name               = "${var.name_prefix}-web"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name_prefix}-web"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/login"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }

  deregistration_delay = 15
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# --- ECS ---------------------------------------------------------------------
resource "aws_ecs_cluster" "web" {
  name = "${var.name_prefix}-web"
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.name_prefix}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.web.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = var.container_port, protocol = "tcp" }
      ]
      environment = [
        for k, v in var.environment : { name = k, value = v }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.web.arn}:DATABASE_URL::" },
        { name = "SESSION_COOKIE_SECRET", valueFrom = "${aws_secretsmanager_secret.web.arn}:SESSION_COOKIE_SECRET::" },
        { name = "STORAGE_S3_ACCESS_KEY_ID", valueFrom = "${aws_secretsmanager_secret.web.arn}:STORAGE_S3_ACCESS_KEY_ID::" },
        { name = "STORAGE_S3_SECRET_ACCESS_KEY", valueFrom = "${aws_secretsmanager_secret.web.arn}:STORAGE_S3_SECRET_ACCESS_KEY::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "web" {
  name            = "${var.name_prefix}-web"
  cluster         = aws_ecs_cluster.web.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = var.container_port
  }

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.http]
}

# --- CloudFront: HTTPS on the AWS-owned certificate --------------------------
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "web" {
  enabled = true
  comment = "${var.name_prefix} OncoBrief web tier"

  origin {
    domain_name = aws_lb.web.dns_name
    origin_id   = "alb"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  price_class = var.cloudfront_price_class
}

output "cloudfront_domain_name" { value = aws_cloudfront_distribution.web.domain_name }
output "web_url" { value = "https://${aws_cloudfront_distribution.web.domain_name}" }
output "alb_dns_name" { value = aws_lb.web.dns_name }
output "alb_zone_id" { value = aws_lb.web.zone_id }
output "ecr_repository_url" { value = aws_ecr_repository.web.repository_url }
output "security_group_id" { value = aws_security_group.web.id }
output "secret_arn" { value = aws_secretsmanager_secret.web.arn }
