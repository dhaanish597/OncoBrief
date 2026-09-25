variable "name_prefix" { type = string }
variable "cognito_issuer" { type = string }
variable "cognito_audience" { type = string }
variable "backend_uri" {
  type        = string
  default     = ""
  description = "Backend origin to proxy to. Empty creates the API + authorizer without an integration target."
}
variable "stage_name" {
  type    = string
  default = "$default"
}

# HTTP API in front of the backend, with a Cognito JWT authorizer. Every
# non-public route requires a valid Cognito token; the backend then re-checks
# membership (auth-api.ts), so the gateway is an outer layer, not the only one.
resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.cognito_issuer
    audience = [var.cognito_audience]
  }
}

resource "aws_apigatewayv2_integration" "backend" {
  count = var.backend_uri == "" ? 0 : 1

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = var.backend_uri
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "default" {
  count = var.backend_uri == "" ? 0 : 1

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.backend[0].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_stage" "this" {
  api_id = aws_apigatewayv2_api.this.id
  name   = var.stage_name
  # `$default` stages deploy automatically; setting auto_deploy on them is
  # rejected by the provider.

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationErr = "$context.integration.error"
    })
  }
}

output "api_endpoint" { value = aws_apigatewayv2_api.this.api_endpoint }
output "api_id" { value = aws_apigatewayv2_api.this.id }
