variable "name_prefix" { type = string }
variable "roles" {
  type    = list(string)
  default = ["clinician", "coordinator", "records_officer", "org_admin", "auditor"]
}
variable "domain_prefix" {
  type    = string
  default = ""
}
variable "callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/api/auth/callback"]
}

# Adds a `custom:org_id` claim so the tenant is carried in the signed token.
resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    name                = "org_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false
    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_group" "roles" {
  for_each     = toset(var.roles)
  name         = each.value
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "OncoBrief role: ${each.value}"
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  callback_urls = var.callback_urls
  logout_urls   = [for u in var.callback_urls : replace(u, "/api/auth/callback", "/")]

  supported_identity_providers = ["COGNITO"]
}

resource "aws_cognito_user_pool_domain" "this" {
  count        = var.domain_prefix == "" ? 0 : 1
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

output "user_pool_id" { value = aws_cognito_user_pool.this.id }
output "user_pool_arn" { value = aws_cognito_user_pool.this.arn }
output "client_id" { value = aws_cognito_user_pool_client.spa.id }
output "issuer" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

data "aws_region" "current" {}
