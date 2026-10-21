# AWS Pre-Deployment Readiness Audit — MacBook

**System:** macOS 26.6 (Build 25G72) | Apple M5 (`arm64`)  
**Workspace:** `/Users/dhaanish/Documents/Oncobrief`  
**Date of Audit:** October 20, 2026  
**Auditor Role:** Senior AWS Cloud Architect, DevSecOps Engineer, & AI Coding-Agent Infrastructure Specialist  

---

## 1. Executive Summary & Readiness Verdict

### Overall Readiness Decision:
> ### 🛑 **C. NOT READY — BLOCKERS REMAIN**
>
> While the AWS CLI v2 is installed and operational, **deployments must NOT be attempted in the current state**. Critical security, identity, regional, and local toolchain blockers must be remediated first. Authentication succeeds, but using the current configuration exposes the AWS account to severe operational and security risks.

### Key Executive Findings

| Category | Status | Finding Summary |
|---|:---:|---|
| **Identity & Authentication** | **FAIL** | CLI is authenticated directly as the **AWS Account Root User** (`arn:aws:iam::3755****0800:root`). Two active **root access keys** exist on the account. Routine development must never use root. |
| **Region Alignment** | **FAIL** | Default CLI configuration is set to **`us-east-1`**, whereas the target infrastructure (`oncobrief-dev`, S3 state, KMS, RDS, VPC) is deployed exclusively in **`ap-south-1`** (Mumbai). |
| **Infrastructure as Code (IaC)** | **FAIL** | **Terraform is NOT installed** on this Mac (`terraform: command not found`). The project's cloud infrastructure relies on Terraform ≥ 1.10. |
| **Container Toolchain** | **FAIL** | **Docker / Colima is NOT installed**. Building and pushing the Next.js web container image to ECR for ECS Fargate cannot be executed locally. |
| **Version Control Baseline** | **WARNING** | Git is installed, but **`user.name` and `user.email` are unset** on this machine, blocking commits. |
| **Account Cost Safeguards** | **WARNING** | **Zero AWS Budgets exist**. While a Cost Anomaly Monitor is active, no budget limits or proactive threshold notifications are set. |
| **Cloud Audit Logging** | **WARNING** | **No multi-region CloudTrail trail exists** (`trailList: []`). AWS account actions are retained only in temporary 90-day console event history. |
| **Account-Level S3 BPA** | **WARNING** | **S3 Block Public Access is NOT enabled at the account level** (`NoSuchPublicAccessBlockConfiguration`), though individual buckets have BPA enabled. |
| **AI Agent Capabilities** | **PASS / WARNING** | Antigravity CLI has **24 AWS skills installed** (`aws-skills` plugin); Claude Code has 23 AWS skills and `aws-mcp`; Codex CLI has `aws-mcp`; MCP servers for Antigravity & Claude Desktop remain unconfigured. |

---

## 2. macOS & Development-Tool Inventory

| Component | Detected Specification | Evaluation | Status |
|---|---|---|:---:|
| **Hardware / Architecture** | Apple M5, arm64, 8 cores | Native Apple Silicon architecture supported by all AWS binaries | **PASS** |
| **macOS Version** | macOS 26.6 (Build 25G72, Darwin Kernel 25.6.0) | Current, fully supported OS release | **PASS** |
| **Shell** | `/bin/zsh` | Standard macOS shell | **PASS** |
| **Shell Initialization** | `~/.zshrc` (`export PATH="$HOME/.local/bin:$PATH"`) | Missing Homebrew environment initialization (`brew shellenv`) | **WARNING** |
| **PATH Configuration** | `/opt/homebrew/bin` is located at the **tail** of `$PATH` | Tools installed via Homebrew may be shadowed by system paths | **WARNING** |
| **Homebrew** | Homebrew 7.0.10 at `/opt/homebrew` | Installed and operational; formula: `postgresql@16`, `gh` | **PASS** |
| **AWS CLI** | `aws-cli/2.38.2` (Universal arm64/x86_64) | Signed by official `AMZN Mobile LLC (94KV3E626L)` | **PASS** |
| **Git** | `git version 2.54.0 (Apple Git-157)` | Binary present; **`user.name` and `user.email` unset** | **WARNING** |
| **GitHub CLI (`gh`)** | `gh` 2.81+ at `/opt/homebrew/bin/gh` | Authenticated as `dhaanish597` with repo/workflow scopes | **PASS** |
| **Node.js** | `v24.21.0` at `/Users/dhaanish/.local/bin/node` | Compatible with project Next.js and esbuild bundling | **PASS** |
| **Package Manager** | `pnpm` 9.15.4 at `/Users/dhaanish/.local/bin/pnpm` | Active package manager defined in repo `packageManager` | **PASS** |
| **Python** | System `python3` 3.9.6; `uv` Python 3.10.22 | `python` alias missing; `uv` and `uvx` available in `~/.local/bin` | **PASS** |
| **Database CLI** | `psql` (PostgreSQL) 16.15 (Homebrew) | Client matches RDS engine version (PostgreSQL 16) | **PASS** |
| **Docker / Colima** | **NOT INSTALLED** | Required for ECS container image builds | **FAIL** |
| **Terraform** | **NOT INSTALLED** | Required for `infra/` stack management | **FAIL** |
| **OpenTofu** | **NOT INSTALLED** | Optional alternative to Terraform | **NOT APPLICABLE** |
| **AWS CDK** | **NOT INSTALLED** | Not used in current OncoBrief architecture | **NOT APPLICABLE** |
| **AWS SAM CLI** | **NOT INSTALLED** | SAM source bucket exists, but SAM not used for current stack | **NOT APPLICABLE** |
| **Session Manager Plugin**| **NOT INSTALLED** | Recommended for secure, bastion-free AWS Systems Manager access | **WARNING** |
| **kubectl / eksctl** | **NOT INSTALLED** | EKS not used in current architecture | **NOT APPLICABLE** |

---

## 3. AWS CLI Configuration Status

### Diagnostic Command Results

```text
$ aws --version
aws-cli/2.38.2 Python/3.14.6 Darwin/25.6.0 script-exe/arm64

$ aws configure list
NAME       : VALUE                    : TYPE             : LOCATION
profile    : <not set>                : None             : None
access_key : ****************6TXC     : login            : 
secret_key : ****************V3mo     : login            : 
region     : us-east-1                : config-file      : ~/.aws/config

$ aws configure list-profiles
default

$ aws sts get-caller-identity
{
    "UserId": "375546530800",
    "Account": "375546530800",
    "Arn": "arn:aws:iam::375546530800:root"
}
```

### Configuration Metadata & Findings

1. **Active Configuration File (`~/.aws/config`):**
   ```ini
   [default]
   login_session = arn:aws:iam::375546530800:root
   region = us-east-1
   ```
2. **Credential Storage:**
   - No static `~/.aws/credentials` file exists.
   - Credentials are generated via the new AWS CLI v2 `aws login` session mechanism, cached temporarily in `~/.aws/cli/cache/session.db` and `~/.aws/login/cache/`.
3. **Region Mismatch (CRITICAL):**
   - The default profile specifies `region = us-east-1`.
   - The actual deployed infrastructure (`oncobrief-dev-vpc`, `oncobrief-documents-dev`, `oncobrief-tfstate-375546530800`, RDS, Lambda functions, KMS key) resides in **`ap-south-1`** (Asia Pacific - Mumbai).
   - Any CLI command run without explicit `--region ap-south-1` queries or creates resources in `us-east-1`.

---

## 4. Authentication and IAM Safety Status

### 1. Active Caller Identity
- **ARN:** `arn:aws:iam::375546530800:root`
- **Identity Type:** AWS Account Root User
- **Status:** **CRITICAL SECURITY RISK (FAIL)**
- **Evidence & Impact:** The AWS Account Root user has unrestricted access to all resources and billing, bypasses IAM permission boundaries, and cannot be restricted by IAM policies. Using the root account for day-to-day development violates the AWS Well-Architected Framework and CIS AWS Foundations Benchmark.

### 2. Root Account Access Keys
- **Finding:** **2 active root user access keys exist** (`AKIAVO4CRJPY****FW6A` created 2026-09-24, and `AKIAVO4CRJPY****K6W7` created 2026-05-15).
- **Status:** **CRITICAL SECURITY VIOLATION (FAIL)**
- **Benchmark:** CIS AWS Foundations Benchmark v3.0 Item 1.4: *"Ensure no root user account access key exists"*.
- **Impact:** If these long-lived root keys are compromised, an attacker obtains full control of the account without restrictions.

### 3. Account IAM Users Inventory

| IAM User | Created | Attached Policies / Inlines | Access Keys | Status / Risk |
|---|---|---|:---:|---|
| **`Dhaanish-mac`** | 2026-10-20 | Inline: `oncobrief-dev-web-storage` (S3 & KMS in `ap-south-1`) | 0 (None) | Incomplete: User created today without credentials, console login, or deployment permissions. |
| **`Claude_code`** | 2026-05-15 | Managed: `OncoBriefWebDeploy`, `StewardDeploymentAccess`, `ClaudeCodeBedrockPolicy`, `AmazonBedrockFullAccess`; Inline: `agentcore-policy`, `StewardKillCheckGrant` | 2 Active | High Privilege: Contains static access keys for an agent principal. |
| **`oncobrief-dev-web-storage`** | 2026-09-25 | Dedicated S3 web storage permissions | 1 Active | Service account for web runtime. |

### 4. IAM Roles & Least-Privilege Posture
- 26 total roles exist in the account.
- All existing custom roles are service execution roles (`oncobrief-dev-lambda`, `oncobrief-dev-web-execution`, `oncobrief-dev-s3-events`, `oncobrief-dev-textract-sns`).
- **No human assume-role exists** (e.g., `OncoBriefDeveloperRole`).
- **Recommendation:** Implement an IAM role for development that can be assumed via short-lived STS credentials or IAM Identity Center, separating developer permissions from production release permissions.

---

## 5. AWS Account & Cost Safeguards

### Safeguard Evaluation Matrix

| Safeguard | Current Configuration | CIS Benchmark / Best Practice | Status |
|---|---|---|:---:|
| **AWS Budgets** | **0 budgets configured** | Monthly cost budget with 80%, 100%, and forecasted alerts | **FAIL** |
| **Cost Anomaly Detection** | 1 Monitor (`Default-Services-Monitor`); 1 Subscription (Daily email for impacts ≥ $100 & ≥ 40%) | Configured, but threshold ($100) is high for development | **PASS / WARNING** |
| **CloudTrail Logging** | **0 trails configured** (`trailList: []`) | Multi-region trail with S3 bucket and CloudWatch logs | **FAIL** |
| **IAM Access Analyzer** | **0 analyzers configured** | Account-level external access analyzer enabled | **WARNING** |
| **AWS GuardDuty** | Disabled in `ap-south-1` and `us-east-1` | Enabled in all active regions | **WARNING** |
| **AWS Security Hub** | Account not subscribed (`InvalidAccessException`) | Enabled with AWS Foundational Security Best Practices | **NOT CHECKED** |
| **S3 Account Block Public Access** | **Not configured** (`NoSuchPublicAccessBlockConfiguration`) | Enabled at account level to prevent accidental exposure | **WARNING** |
| **Bucket-Level S3 BPA** | Enabled on all 3 existing buckets | Verified: `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets` = `true` | **PASS** |
| **Default VPC Exposure** | Default VPC `vpc-0163a13122ab4cd0c` exists in `ap-south-1` | Workloads isolated in custom VPC `vpc-004039b779557c6d8` (`oncobrief-dev-vpc`) | **PASS** |
| **Organizations / SCPs** | Standalone account (`AWSOrganizationsNotInUseException`) | Recommended for production multi-account isolation | **NOT APPLICABLE** |

---

## 6. Deployment Toolchain Readiness

| Deployment Path | Required Components | Local Availability | Cloud Resource Readiness | Status |
|---|---|---|---|:---:|
| **Static Web / CloudFront** | S3, CloudFront, ACM | AWS CLI available | CloudFront `E1E7Q4M27D5UQO` (`dsc1vmsr4q09g.cloudfront.net`) active | **PASS** |
| **Worker / Serverless** | Node 24, pnpm, esbuild, Lambda, SQS, Textract | `pnpm worker:build` verified | Lambdas `oncobrief-dev-admin`, `document-ingest`, `ocr-result` deployed in `ap-south-1` | **PASS** |
| **Backend Web Container** | Docker, ECR, ECS Fargate, ALB | **Docker missing** | ECR `oncobrief-dev-web`, ECS Fargate service active | **FAIL (Local)** |
| **Relational Database** | PostgreSQL 16, psql, Secrets Manager | `psql` 16.15 installed | RDS `oncobrief-dev-db` private in VPC; admin Lambda invocation verified | **PASS** |
| **Infrastructure as Code** | Terraform ≥ 1.10, S3 backend | **Terraform missing** | S3 state bucket `oncobrief-tfstate-375546530800` active with S3 locking | **FAIL (Local)** |
| **AI Extraction (Bedrock)** | Bedrock Runtime Converse API | Configured in worker | `apac.amazon.nova-pro-v1:0` in `ap-south-1` | **PASS** |
| **Secrets & Encryption** | AWS Secrets Manager, KMS | AWS CLI available | Secrets `oncobrief-dev-web`, KMS CMK `bb27fe5e-...` active | **PASS** |
| **CI/CD Pipeline** | GitHub Actions, AWS OIDC | Repo `ci.yml` exists | **No OIDC provider in IAM**; CI runs local unit/build only | **WARNING** |

---

## 7. AI Agent, Skills, Plugins, & MCP Audit

### Agent Environment Comparison

| AI Tool | Installed Version | AWS Skills Available | AWS MCP Server Configured |
|---|---|:---:|:---:|
| **Claude Code** | 2.1.299 (`~/.local/bin/claude`) | **23 AWS skills** in `~/.claude/skills` | **`aws-mcp`** via `uvx mcp-proxy-for-aws@latest` (active) |
| **OpenAI Codex CLI** | 0.163.0-alpha.10.2 (`~/.local/bin/codex`) | 0 AWS skills in `~/.codex/skills` | **`aws-mcp`** in `~/.codex/config.toml` (active) |
| **Claude Desktop** | Version in `/Applications/Claude.app` | Built-in UI capabilities | None (`claude_desktop_config.json` lacks `aws-mcp`) |
| **Antigravity CLI** | 1.4.3 (`~/.local/bin/agy`) | **24 AWS skills** (`aws-skills` plugin enabled) | None (`~/.gemini/antigravity-cli/mcp/` lacks `aws-mcp`) |
| **OpenAI Codex Desktop** | Not installed (`ChatGPT.app` only) | N/A | N/A |

### Reputable AWS Capabilities & Extensions Catalog

| Capability / Tool | Type | Source & Provider | Compatibility | Security Risks & Scope | Recommended Action |
|---|---|---|---|---|---|
| **`mcp-proxy-for-aws`** | MCP Server | Official AWS (`https://github.com/awslabs/mcp-proxy-for-aws`) | Claude Code, Codex, Antigravity CLI, Claude Desktop | Executes AWS CLI/SDK operations via active credentials. Risk of unapproved writes if not run with `--read-only`. | **Approve with `--read-only` flag for dev agents** |
| **AWS Documentation MCP** | MCP Server | Amazon AWS (`https://aws-mcp.us-east-1.api.aws/mcp`) | Claude Code, Codex, Antigravity CLI | Read-only API reference & architecture guidance. No cloud mutation capability. | **Approve for all agents** |
| **AWS Well-Architected Skills** | Agent Skills | Curated AWS Skills (`aws-well-architected-review`, `aws-iam`, `aws-security`) | Claude Code, Codex, Antigravity | Pure markdown instructions. No execution risk. | **Link into Antigravity & Codex skills** |
| **LocalStack** | Local Cloud Emulator | Official LocalStack (`https://localstack.cloud`) | Docker / CLI | Runs offline AWS services locally for cost-free testing. | **Optional for local offline testing** |
| **`checkov` / `tfsec`** | Static IaC Scanner | Bridgecrew / Palo Alto Networks | CLI / Homebrew | Statically scans Terraform for security misconfigurations without AWS credentials. | **Recommended for pre-commit linting** |

---

## 8. Verified Issues, Potential Issues, & Unverified Items

### Verified Issues (Must Fix)

| ID | Severity | Finding | Evidence | Impact | Recommended Action |
|---|:---:|---|---|---|---|
| **ISSUE-01** | **CRITICAL** | AWS CLI session is logged in as root | `aws sts get-caller-identity` returns `arn:aws:iam::3755****0800:root` | Extreme blast radius; breaks auditability and least-privilege principles | Log out of root session; configure a dedicated developer IAM user or role |
| **ISSUE-02** | **CRITICAL** | Active root user access keys exist | `aws iam list-access-keys` lists 2 active keys on root account | Severe credential exposure vulnerability (CIS AWS 1.4 violation) | Delete both root access keys via AWS Console |
| **ISSUE-03** | **HIGH** | Default region mismatch | `~/.aws/config` has `region = us-east-1`; all resources are in `ap-south-1` | Accidental deployment to wrong region; commands fail to find resources | Update `~/.aws/config` default region to `ap-south-1` |
| **ISSUE-04** | **HIGH** | Terraform missing on MacBook | `which terraform` returns not found | Cannot plan, validate, or deploy `infra/` cloud resources | Install Terraform ≥ 1.10 via Homebrew |
| **ISSUE-05** | **HIGH** | Docker missing on MacBook | `which docker` returns not found | Cannot build or push Next.js container image to ECR for ECS Fargate | Install Docker Desktop or Colima via Homebrew |
| **ISSUE-06** | **MEDIUM** | Git user and email unset | `git config user.name` returns empty | Git commits fail on this machine | Configure local or global Git identity |
| **ISSUE-07** | **MEDIUM** | Shell PATH ordering suboptimal | `~/.zshrc` does not initialize `brew shellenv`; `/opt/homebrew/bin` is at end of PATH | Homebrew binaries may be shadowed by system utilities | Add `eval "$(/opt/homebrew/bin/brew shellenv)"` to `~/.zprofile` |

### Potential Issues & Incomplete Safeguards

| ID | Severity | Finding | Evidence | Impact |
|---|:---:|---|---|---|
| **SEC-01** | **MEDIUM** | Zero AWS Budgets configured | `aws budgets describe-budgets` returns empty | No alert if unexpected compute or NAT gateway costs accumulate |
| **SEC-02** | **MEDIUM** | CloudTrail multi-region trail missing | `aws cloudtrail describe-trails` returns `[]` | No immutable S3 record of API calls for security investigations |
| **SEC-03** | **LOW** | Account-level S3 Block Public Access missing | `get-public-access-block` returns `NoSuchPublicAccessBlockConfiguration` | New buckets created without explicit BPA could be exposed |
| **SEC-04** | **LOW** | Session Manager Plugin missing | `which session-manager-plugin` returns not found | Cannot start secure SSM interactive shell sessions to private instances |

---

## 9. Prioritized Remediation Plan

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRIORITIZED REMEDIATION                         │
├────────────────────┬───────────────────────────────────────────────────┤
│ Phase 1: Local Mac │ Install Terraform, Docker/Colima, fix PATH & Git  │
│ Phase 2: AWS CLI   │ Fix default region (ap-south-1), configure profile│
│ Phase 3: IAM & Dev │ Create developer IAM role/keys; delete root keys  │
│ Phase 4: Safeguards│ Create zero-cost budget alert, enable CloudTrail  │
│ Phase 5: AI Tools  │ Link AWS skills and safe read-only AWS MCP servers│
└────────────────────┴───────────────────────────────────────────────────┘
```

---

## 10. Step-by-Step Fixes & Command Reference

> [!IMPORTANT]
> **Approval Gate:** In accordance with the Critical Safety Rules, the following commands are provided for your review. No modifications have been executed automatically.

### Group A: Local MacBook Fixes (Zero Cloud Risk, Free)

#### 1. Fix Homebrew Shell Environment in `~/.zprofile`
Ensure Homebrew binaries (`/opt/homebrew/bin`) take precedence in PATH:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

#### 2. Install Required Missing Tools via Homebrew
```bash
# Install Terraform (required for infra/), Session Manager Plugin
brew install terraform aws-session-manager-plugin

# Install Docker (either Docker Desktop via cask or Colima for lightweight CLI engine)
brew install colima docker docker-compose
# To start Colima: colima start --cpu 4 --memory 8
```

#### 3. Configure Git Identity
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

### Group B: AWS CLI Configuration & Regional Alignment (Local, Free)

#### 1. Update Default Region to `ap-south-1`
Update `~/.aws/config` so all default operations target the active workload region:
```bash
aws configure set default.region ap-south-1
aws configure set default.output json
```

#### 2. Verify Region Configuration
```bash
aws configure get region
# Expected: ap-south-1
```

---

### Group C: IAM Identity & Security Posture Remediation (Cloud, Free)

#### 1. Delete the Two Root User Access Keys
> **Critical:** Access keys for the root account must never exist.
- Log in to the [AWS Management Console](https://console.aws.amazon.com/) as the Root user.
- Navigate to **IAM** → **My Security Credentials** (or Account Settings).
- Under **Access keys**, identify the two active keys (`AKIAVO4CRJPY****FW6A` and `AKIAVO4CRJPY****K6W7`).
- Delete both access keys.

#### 2. Configure Dedicated Developer Profile
Instead of running `aws login` as root, configure the local CLI to use the `Dhaanish-mac` IAM user or create a dedicated `OncoBriefDeveloperRole`:
- Attach the `OncoBriefWebDeploy` managed policy to `Dhaanish-mac` (or an assumed developer role).
- Create an access key for `Dhaanish-mac` or configure IAM Identity Center.
- Configure a named AWS profile:
  ```bash
  aws configure --profile oncobrief-dev
  # Set region to ap-south-1
  ```

---

### Group D: Account Safeguards & Budgets (Zero / Minimal Cost)

#### 1. Create a Zero-Cost Monthly Budget Alert
Create an AWS Budget to alert you if monthly spend exceeds a low threshold (e.g., $20/month):
```bash
aws budgets create-budget \
  --account-id 375546530800 \
  --budget '{
    "BudgetName": "Monthly-Dev-Safety-Budget",
    "BudgetLimit": {
      "Amount": "20",
      "Unit": "USD"
    },
    "CostTypes": {
      "IncludeTax": true,
      "IncludeSubscription": true,
      "UseBlended": false,
      "IncludeRefund": false,
      "IncludeCredit": false,
      "IncludeUpfront": true,
      "IncludeRecurring": true,
      "IncludeOtherSubscription": true,
      "IncludeSupport": true,
      "IncludeDiscount": true,
      "UseAmortized": false
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "clashanimations597@gmail.com"
    }]
  }]'
```
*(AWS Budgets includes 2 free budgets per account; this action incurs zero charges).*

#### 2. Enable S3 Account-Level Block Public Access
Prevent any accidental bucket creation with public policies:
```bash
aws s3control put-public-access-block \
  --account-id 375546530800 \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'
```

---

### Group E: AI Agent Environment & Skills Alignment (Free)

#### 1. Configure Safe Read-Only AWS MCP Server for Antigravity & Claude Desktop
Add `aws-mcp` with `--read-only` flag to prevent AI coding agents from mutating cloud resources without explicit command-line approval.

For Antigravity CLI, register `aws-mcp` in `~/.gemini/antigravity-cli/mcp/`:
```bash
# Register read-only AWS MCP proxy
uvx mcp-proxy-for-aws@latest https://aws-mcp.us-east-1.api.aws/mcp --read-only --metadata INSTALL_SOURCE=antigravity
```

#### 2. Share AWS Skills with Codex CLI
Symlink the verified AWS skills from Claude Code to Codex:
```bash
for skill in ~/.claude/skills/aws-*; do
  ln -s "$skill" ~/.codex/skills/$(basename "$skill")
done
```

---

## 11. Final Reusable Pre-Deployment Checklist

Before triggering **ANY** future deployment (local or automated), execute this checklist:

```markdown
### 🛡️ Pre-Deployment Verification Checklist

- [ ] **1. Account & Region Verification**
      - Run: `aws sts get-caller-identity`
      - Confirm: Account matches `3755****0800` (Dev/Test account).
      - Confirm: ARN is NOT `...:root`.
      - Run: `aws configure get region`
      - Confirm: Active region is `ap-south-1`.

- [ ] **2. Credential Security**
      - Confirm: No static AWS secret keys or `.env` files are tracked by Git (`git status`).
      - Confirm: `terraform.tfvars` and `.env` match `.gitignore`.

- [ ] **3. Git Baseline**
      - Confirm: Working directory is clean or changes are intentionally staged.
      - Confirm: `git config user.name` and `git config user.email` are set.

- [ ] **4. Build & Bundle Prerequisites**
      - Run: `pnpm verify` (lint, typecheck, tests, clinical boundary check pass).
      - Run: `pnpm worker:build` (esbuild generates `infra/build/worker/index.js` and `admin.js`).

- [ ] **5. Infrastructure Plan Inspection**
      - Run: `terraform -chdir=infra/environments/dev init`
      - Run: `terraform -chdir=infra/environments/dev plan -out=tfplan`
      - Confirm: Review the exact resource diff. Verify 0 unexpected destroys.

- [ ] **6. Container Verification (If deploying Web Tier)**
      - Confirm: Docker daemon is active (`docker info`).
      - Run: ECR login: `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com`
      - Confirm: Image tags adhere to immutable semantic or commit SHA tags.

- [ ] **7. Cost & Rollback Safeguards**
      - Confirm: AWS Budget alert is active.
      - Confirm: ECS deployment circuit breaker and CloudWatch error alarms are intact.
```

---

*Report generated and verified by OncoBrief DevSecOps Audit Process.*
