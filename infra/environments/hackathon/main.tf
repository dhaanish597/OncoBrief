variable "image_tag" { default = "pending" }
variable "desired_count" { default = 0 }
variable "release_evaluators" { default = false }
variable "evaluator_auth_sha256" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.evaluator_auth_sha256))
    error_message = "Supply the SHA-256 digest of the evaluator Authorization header."
  }
}
variable "sarvam_api_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "nvidia_api_key" {
  type      = string
  sensitive = true
  default   = ""
}
locals {
  prefix    = "oncobrief-hackathon"
  ecs_trust = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
data "aws_kms_key" "documents" { key_id = "bb27fe5e-bd3e-46c6-a496-c4187ebec246" }
module "vpc" {
  source             = "../../modules/vpc"
  name_prefix        = local.prefix
  vpc_cidr           = "10.61.0.0/16"
  azs                = ["ap-south-1a", "ap-south-1b"]
  enable_nat_gateway = false
}
module "documents" {
  source        = "../../modules/s3"
  bucket_name   = "oncobrief-hackathon-375546530800"
  kms_key_arn   = data.aws_kms_key.documents.arn
  force_destroy = false
}
resource "aws_s3_bucket_policy" "tls" {
  bucket = module.documents.bucket_id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Sid = "DenyPlaintext", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [module.documents.bucket_arn, "${module.documents.bucket_arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}
resource "aws_security_group" "web" {
  name   = "${local.prefix}-tasks"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 3000
    to_port         = 3000
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
data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }
resource "aws_security_group" "alb" {
  name   = "${local.prefix}-alb"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }
  egress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["10.61.0.0/16"]
  }
}
module "db" {
  source                     = "../../modules/rds"
  name_prefix                = local.prefix
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.web.id]
  instance_class             = "db.t4g.micro"
  engine_version             = "16.14"
  db_name                    = "oncobrief"
  username                   = "oncobrief_bootstrap"
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "oncobrief-hackathon-final"
}
resource "random_password" "app" {
  length  = 48
  special = false
}
resource "random_password" "session" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.prefix}-app"
  recovery_window_in_days = 7
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL          = "postgres://oncobrief_app:${random_password.app.result}@${module.db.endpoint}:5432/oncobrief?sslmode=verify-full"
    SESSION_COOKIE_SECRET = random_password.session.result
    SARVAM_API_KEY        = var.sarvam_api_key
    NVIDIA_API_KEY        = var.nvidia_api_key
  })
}
resource "aws_iam_role" "execution" {
  name               = "${local.prefix}-execution"
  assume_role_policy = local.ecs_trust
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "secrets" {
  role   = aws_iam_role.execution.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.app.arn }] })
}
resource "aws_iam_role" "runtime" {
  for_each           = toset(["task", "bootstrap"])
  name               = "${local.prefix}-${each.key}"
  assume_role_policy = local.ecs_trust
}
resource "aws_iam_role_policy" "runtime" {
  for_each = aws_iam_role.runtime
  role     = each.value.name
  policy = jsonencode({
    Version = "2012-10-17", Statement = concat([
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:GetObjectVersion", "s3:DeleteObject"], Resource = "${module.documents.bucket_arn}/org/*" },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = data.aws_kms_key.documents.arn }
  ], each.key == "bootstrap" ? [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = module.db.master_secret_arn }] : []) })
}
resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}-web"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${local.prefix}"
  retention_in_days = 7
}
resource "aws_ecs_cluster" "web" { name = local.prefix }
resource "aws_ecs_task_definition" "app" {
  for_each                 = toset(["web", "bootstrap"])
  family                   = "${local.prefix}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.runtime[each.key == "web" ? "task" : "bootstrap"].arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([merge({
    name         = "web"
    image        = "${aws_ecr_repository.web.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [for k, v in {
      NODE_ENV                     = "production"
      ONCOBRIEF_DEPLOYMENT_PROFILE = "hackathon"
      ONCOBRIEF_DEMO_MODE          = "true"
      STORAGE_DRIVER               = "s3"
      STORAGE_S3_BUCKET            = module.documents.bucket_name
      STORAGE_S3_REGION            = "ap-south-1"
      AWS_REGION                   = "ap-south-1"
      QUEUE_DRIVER                 = "memory"
      DOCUMENT_INGESTION_MODE      = "sync"
      OCR_DRIVER                   = "auto"
      EXTRACTION_DRIVER            = "rule"
      AUTH_MODE                    = "session"
      ABDM_DRIVER                  = "simulated"
      DELIVERY_DRIVER              = "simulated"
      SIMULATE_DELIVERY_ONLY       = "1"
      DB_MASTER_SECRET_ARN         = each.key == "bootstrap" ? module.db.master_secret_arn : ""
    } : { name = k, value = v }]
    secrets          = [for key in ["DATABASE_URL", "SESSION_COOKIE_SECRET", "SARVAM_API_KEY", "NVIDIA_API_KEY"] : { name = key, valueFrom = "${aws_secretsmanager_secret.app.arn}:${key}::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.web.name, "awslogs-region" = "ap-south-1", "awslogs-stream-prefix" = each.key } }
  }, each.key == "bootstrap" ? { command = ["pnpm", "exec", "tsx", "tools/hackathon-bootstrap.ts"] } : {})])
}
resource "aws_lb" "web" {
  name               = local.prefix
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.private_subnet_ids
}
resource "aws_lb_target_group" "web" {
  name        = local.prefix
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path     = "/api/v1/health"
    matcher  = "200"
    interval = 30
  }
}
resource "aws_lb_listener" "web" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
resource "aws_ecs_service" "web" {
  name            = local.prefix
  cluster         = aws_ecs_cluster.web.id
  task_definition = aws_ecs_task_definition.app["web"].arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = module.vpc.public_subnet_ids
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }
  health_check_grace_period_seconds = 120
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  depends_on = [aws_lb_listener.web, aws_iam_role_policy.secrets, aws_secretsmanager_secret_version.app]
}
resource "aws_cloudfront_vpc_origin" "web" {
  vpc_origin_endpoint_config {
    name                   = local.prefix
    arn                    = aws_lb.web.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
  depends_on = [aws_lb_listener.web, module.vpc]
}
resource "aws_cloudfront_function" "evaluator" {
  name    = "${local.prefix}-evaluator"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = templatefile("${path.module}/evaluator.js.tftpl", { auth_hash = var.evaluator_auth_sha256 })
}
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "viewer" { name = "Managed-AllViewer" }
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${local.prefix}-private"
  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "private, no-store"
      override = true
    }
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow, noarchive"
      override = true
    }
  }
  security_headers_config {
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "same-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      override                   = true
    }
  }
}
resource "aws_cloudfront_distribution" "web" {
  enabled     = var.release_evaluators
  comment     = "OncoBrief restricted synthetic hackathon evaluation"
  price_class = "PriceClass_200"
  origin {
    domain_name = aws_lb.web.dns_name
    origin_id   = "private-app"
    vpc_origin_config { vpc_origin_id = aws_cloudfront_vpc_origin.web.id }
  }
  default_cache_behavior {
    target_origin_id           = "private-app"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.viewer.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.evaluator.arn
    }
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
output "web_url" { value = "https://${aws_cloudfront_distribution.web.domain_name}" }
output "ecr_repository" { value = aws_ecr_repository.web.repository_url }
output "bootstrap_task_definition" { value = aws_ecs_task_definition.app["bootstrap"].arn }
output "subnet_ids" { value = module.vpc.public_subnet_ids }
output "task_security_group" { value = aws_security_group.web.id }
output "cluster" { value = aws_ecs_cluster.web.name }
output "database_endpoint" { value = module.db.endpoint }
