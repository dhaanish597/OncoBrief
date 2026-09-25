variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}
variable "instance_class" { type = string }
variable "engine_version" { type = string }
variable "db_name" { type = string }
variable "username" {
  type      = string
  sensitive = true
}
variable "allocated_storage" {
  type    = number
  default = 20
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db"
  description = "OncoBrief database: private, reachable only by the worker/web security groups."
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from authorised security groups"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name_prefix}-pg16"
  family = "postgres16"
}

# Credentials live in Secrets Manager, never in code or state.
resource "aws_db_instance" "this" {
  identifier                      = "${var.name_prefix}-db"
  engine                          = "postgres"
  engine_version                  = var.engine_version
  instance_class                  = var.instance_class
  allocated_storage               = var.allocated_storage
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = var.db_name
  username                        = var.username
  manage_master_user_password     = true
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = 7
  deletion_protection             = false
  skip_final_snapshot             = true
  apply_immediately               = true
  auto_minor_version_upgrade      = false
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  parameter_group_name            = aws_db_parameter_group.this.name
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

output "endpoint" { value = aws_db_instance.this.address }
output "port" { value = aws_db_instance.this.port }
output "security_group_id" { value = aws_security_group.db.id }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
