# AWS DLQ Auto-Healing System

<p align="center">
  <img src="https://img.shields.io/badge/AWS-Lambda-FF9900?style=flat-square&logo=aws-lambda&logoColor=white" alt="AWS Lambda"/>
  <img src="https://img.shields.io/badge/AWS-SQS-FF9900?style=flat-square&logo=amazon-aws&logoColor=white" alt="AWS SQS"/>
  <img src="https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"/>
</p>

A production-grade DLQ (Dead Letter Queue) processing system on AWS that **classifies**, **recovers**, **alerts**, and **archives** failed messages with full observability.

---

## 🎯 The Problem

**Ever sent a message that didn't go through?**

Dead Letter Queues exist in most distributed systems, but they're treated as the end of the road—a place where failed messages go to die. No alerts. No retry. No context. Just silent business loss.

In reality, DLQs should be the **start of diagnosis and recovery**, not the end.

---

## 💡 The Solution

This system ensures every failed message gets:
- ✅ **Classified** by failure type (auth, validation, timeout, etc.)
- 🔄 **Auto-healed** if retry-safe (with idempotency)
- 🚨 **Alerted** if requiring immediate attention (auth failures)
- 📦 **Archived** with full context if permanently invalid
- 📊 **Observed** in real-time CloudWatch dashboards

**Not all failures deserve retries. This system knows the difference.**

---

## 🏗️ Architecture Overview

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ▼
┌─────────────────┐         ┌──────────────────┐
│  API Gateway    │────────▶│ Producer Lambda  │
└─────────────────┘         └────────┬─────────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │  Main SQS      │
                            │  Queue         │
                            └────────┬───────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │ Consumer       │◀─── Processes messages
                            │ Lambda         │     with retry logic
                            └────────┬───────┘
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                          ▼                     ▼
                    (Success)              (Failure)
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │  Dead Letter     │
                                    │  Queue (DLQ)     │
                                    └─────────┬────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  Healing Lambda  │
                                    │  (Classifier)    │
                                    └─────────┬────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                     │
                        ▼                     ▼                     ▼
              ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
              │   Auto-Heal     │   │   Alert (SNS)   │   │  Archive (S3)   │
              │   Re-Queue SQS  │   │   Notify Team   │   │  + DynamoDB     │
              └─────────────────┘   └─────────────────┘   └─────────────────┘
                      │
                      └──────────▶ Back to Main Queue
```

---

## 🧠 How It Works

### 1️⃣ **Monitor**
- CloudWatch tracks:
  - Main SQS queue depth
  - DLQ message count
  - Lambda invocations, errors, duration
  - Auto-healed vs archived messages
- Real-time dashboards provide system observability

### 2️⃣ **Classify**
When a message lands in the DLQ, the **Healing Lambda** inspects it and determines the failure type:

| Failure Type | Cause | Example |
|--------------|-------|---------|
| 🔒 **Auth Failure** | Invalid credentials, expired tokens | `401 Unauthorized` |
| ✅ **Validation Error** | Malformed payload, missing required fields | `{"user": null}` |
| ⏲️ **Timeout** | Downstream service slow/unavailable | Lambda timeout after 30s |
| 📦 **Bad Payload** | Corrupted data, encoding issues | Invalid JSON |
| 🔗 **Dependency Failure** | Third-party API down | Payment gateway 503 |

### 3️⃣ **Categorize**
Each failure type is mapped to a deterministic recovery action:

| Failure Type | Action | Rationale |
|--------------|--------|-----------|
| Timeout (Retry-safe) | 🔄 **Auto-heal** → Re-queue to Main SQS | Transient failure, likely to succeed on retry |
| Auth Failure | 🚨 **Alert** → SNS notification | Requires immediate human intervention |
| Validation Error | 📦 **Archive** → S3 + DynamoDB | Permanent failure, log for audit |
| Bad Payload | 📦 **Archive** → S3 + DynamoDB | Cannot be fixed automatically |
| Dependency Failure | 🔄 **Auto-heal** (with backoff) | External service may recover |

### 4️⃣ **Heal or Archive**

**Auto-Healing Flow:**
1. Healing Lambda validates the message is retry-safe
2. Message is re-queued to Main SQS
3. CloudWatch logs the recovery action
4. DynamoDB tracks the healing event (for metrics)

**Archive Flow:**
1. Message is stored in S3 with full context:
   - Original payload
   - Failure reason
   - Timestamp
   - CloudWatch logs link
2. Metadata stored in DynamoDB for querying
3. Optional: Trigger SNS alert for critical failures

---

## 📊 Observability Dashboard

The CloudWatch dashboard provides real-time visibility into:

### **Messages Status Panel**
- Auth Failures: `5`
- Bad Payloads: `5`
- Order Processed: `13`
- Archived: `6`
- Timeout Healed: `1`
- Validation Failures: `4`

### **Lambda Health Panel**
- **Healing Lambda**: 31 invocations, 0 errors, 1.7s avg duration
- **Consumer Lambda**: 38 invocations, 35 errors, 11ms avg duration

### **Queue Depth Panel**
- Main SQS Messages Available: `1`
- DLQ Messages Visible: `1`

**Example Screenshot:**
![DLQ Auto-Healing Dashboard](./CloudWatch/CW%20Dashboard.png)

---

## 🚀 Deployment

### Prerequisites
- AWS CLI configured with appropriate credentials
- Python 3.9+
- AWS SAM CLI or Terraform (optional)

### Environment Variables

#### **Consumer Lambda**
| Variable | Description | Example |
|----------|-------------|---------|
| `DLQ_URL` | Dead Letter Queue URL | `https://sqs.us-east-1.amazonaws.com/.../dlq` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

#### **Healing Lambda**
| Variable | Description | Example |
|----------|-------------|---------|
| `MAIN_QUEUE_URL` | Main SQS queue URL for re-queuing | `https://sqs.us-east-1.amazonaws.com/.../main-queue` |
| `ARCHIVE_BUCKET` | S3 bucket for archived failures | `dlq-archive-bucket` |
| `FAILED_TABLE` | DynamoDB table for failure tracking | `DLQ-FailureTracking` |
| `ALERT_TOPIC_ARN` | SNS topic for critical alerts | `arn:aws:sns:us-east-1:123456789012:dlq-alerts` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

### IAM Permissions

**Consumer Lambda** needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:main-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:*:*:dlq"
    }
  ]
}
```

**Healing Lambda** needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage"
      ],
      "Resource": [
        "arn:aws:sqs:*:*:dlq",
        "arn:aws:sqs:*:*:main-queue"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::dlq-archive-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/DLQ-FailureTracking"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "arn:aws:sns:*:*:dlq-alerts"
    }
  ]
}
```

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/dlq-auto-healing.git
cd dlq-auto-healing
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Deploy infrastructure** (using AWS SAM or Terraform)
```bash
# Using SAM
sam build
sam deploy --guided

# Using Terraform
terraform init
terraform plan
terraform apply
```

4. **Configure environment variables** in AWS Lambda console or IaC

5. **Set up CloudWatch Dashboard** (import from `cloudwatch-dashboard.json`)

---

## 📁 Project Structure

```
.
├── lambdas/
│   ├── consumer/
│   │   ├── handler.py          # Main SQS consumer logic
│   │   └── requirements.txt
│   └── healing/
│       ├── handler.py          # DLQ healing logic
│       ├── classifiers.py      # Failure classification rules
│       └── requirements.txt
├── infrastructure/
│   ├── cloudformation/         # CloudFormation templates
│   ├── terraform/              # Terraform modules
│   └── sam-template.yaml       # AWS SAM template
├── tests/
│   ├── test_consumer.py
│   └── test_healing.py
├── docs/
│   ├── architecture.png
│   └── dashboard-screenshot.png
├── cloudwatch-dashboard.json   # CloudWatch dashboard config
├── requirements.txt
└── README.md
```

---

## 🧪 Testing

### Unit Tests
```bash
pytest tests/ -v
```

### Integration Tests
```bash
# Send test messages to Main SQS
python tests/integration/send_test_messages.py

# Verify healing behavior
python tests/integration/verify_healing.py
```

### Local Testing with LocalStack
```bash
# Start LocalStack
docker-compose up -d

# Run tests against local environment
LOCALSTACK=true pytest tests/
```

---

## 🔍 Failure Classification Logic

The healing Lambda uses the following classification rules:

```python
def classify_failure(message, error_log):
    """
    Classify failure based on message content and error logs
    
    Returns: (failure_type, is_retryable, action)
    """
    
    # Check for authentication failures
    if "401" in error_log or "Unauthorized" in error_log:
        return ("AUTH_FAILURE", False, "ALERT")
    
    # Check for validation errors
    if "ValidationException" in error_log or "invalid" in message.lower():
        return ("VALIDATION_ERROR", False, "ARCHIVE")
    
    # Check for timeouts (retry-safe)
    if "timeout" in error_log.lower() or "Task timed out" in error_log:
        return ("TIMEOUT", True, "AUTO_HEAL")
    
    # Check for bad payloads
    if "JSONDecodeError" in error_log or message is None:
        return ("BAD_PAYLOAD", False, "ARCHIVE")
    
    # Check for dependency failures (retry with backoff)
    if "503" in error_log or "Connection refused" in error_log:
        return ("DEPENDENCY_FAILURE", True, "AUTO_HEAL")
    
    # Default: archive for manual review
    return ("UNKNOWN", False, "ARCHIVE")
```

---

## 📈 Key Metrics

Track these metrics in CloudWatch:

| Metric | Description | Threshold |
|--------|-------------|-----------|
| `DLQ_Messages_Visible` | Messages in DLQ | Alert if > 10 for 5 min |
| `Healing_Invocations` | Healing Lambda runs | Track trend |
| `Auto_Healed_Count` | Messages successfully recovered | Business metric |
| `Archived_Count` | Messages permanently failed | Business metric |
| `Healing_Errors` | Healing Lambda failures | Alert if > 0 |
| `Consumer_Error_Rate` | % of consumer failures | Alert if > 5% |

---

## 🎯 Design Principles

1. **DLQs are not endpoints** — they're the start of recovery
2. **Not all failures deserve retries** — classify first, act second
3. **Healing must be explicit and observable** — no silent retries
4. **Archival must preserve full context** — enable root cause analysis
5. **Idempotency is assumed for auto-healed flows** — retry-safe by design
6. **Observability over monitoring** — dashboards show *why*, not just *what*

---

## 🚨 Common Pitfalls & Solutions

### Problem: Messages stuck in infinite retry loop
**Solution:** The healing Lambda tracks retry count in DynamoDB and archives messages after N attempts.

### Problem: Auth failures flooding SNS alerts
**Solution:** Use SNS message deduplication or rate limiting in the healing Lambda.

### Problem: S3 archive growing too large
**Solution:** Set S3 lifecycle policies to move old failures to Glacier or delete after retention period.

### Problem: Consumer Lambda has high error rate
**Solution:** Review failure classification logic — may need to adjust retry conditions.

---

## 🛠️ Customization

### Adding New Failure Types
1. Update `classifiers.py` with new classification rule
2. Add corresponding action in `handler.py`
3. Update CloudWatch metrics/dashboards
4. Add test cases

### Changing Retry Strategy
Edit the healing Lambda to implement:
- Exponential backoff
- Maximum retry count
- Conditional retries based on message age

### Integrating with External Systems
- Add webhooks to notify external incident management tools
- Send metrics to DataDog, New Relic, etc.
- Archive to external storage (e.g., database, data lake)

---

## 📖 References

- [AWS SQS Dead-Letter Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [AWS Lambda Error Handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html)
- [Designing Resilient Systems on AWS](https://aws.amazon.com/architecture/well-architected/)

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## ⚠️ Disclaimer

This system demonstrates **failure-aware message processing** patterns for AWS.

**Important Notes:**
- Healing logic is **domain-specific** and should not be blindly copied across services
- Always test healing behavior in a staging environment
- Review retry logic carefully to avoid infinite loops
- Ensure downstream systems are idempotent before enabling auto-healing
- Monitor costs — DLQ processing adds Lambda invocations and S3 storage

**Use at your own risk.** This is a reference implementation, not production-ready code.

---

<p align="center">
  <strong>⭐ If you found this useful, please star the repo!</strong>
</p>
