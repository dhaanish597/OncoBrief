# WORKLOAD & CONCURRENCY ASSUMPTIONS across SCENARIOS 1–5

**Document ID:** `costs/workload-assumptions.md`  
**Audit Date:** November 5, 2026  

| Parameter | Scenario 1: Demo | Scenario 2: Small Pilot | **Scenario 3: 100u Hospital (Main Target)** | Scenario 4: 5 Hospitals | Scenario 5: 20 Hospitals |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Registered Staff Users** | `5 – 10` | `25` | **`100`** | `500` | `2,000` |
| **Monthly Active Staff Users (MAU)** | `6` | `18` | **`75`** | `375` | `1,500` |
| **Active Clinic-Hour Sessions (08:30–14:30 IST)** | `3 – 6` | `8 – 15` | **`20 – 35`** | `100 – 175` | `400 – 700` |
| **Simultaneous In-Flight HTTP/DB Requests** | `2 – 5` | `5 – 8` | **`5 – 12`** | `25 – 60` | `100 – 240` |
| **Daily / Monthly Consultations** | `2 / 30` | `12 / 300` | **`60 / 1,500`** | `300 / 7,500` | `1,200 / 30,000` |
| **Monthly Documents Uploaded** | `50` | `500` | **`2,500`** | `12,500` | `50,000` |
| **Average Pages per Document (Total Pages/Mo)** | `4` (`200` pp) | `4` (`2,000` pp) | **`4` (`10,000` pp)** | `4` (`50,000` pp) | `4` (`200,000` pp) |
| **Born-Digital PDF / FHIR Bypass (`$0` Local OCR)** | `20%` (`40` pp) | `20%` (`400` pp) | **`20%` (`2,000` pp)** *(Low case: `60%`)* | `20%` (`10,000` pp) | `20%` (`40,000` pp) |
| **Textract `DetectDocumentText` Pages (`$0.0015/p`)** | `70%` (`140` pp) | `70%` (`1,400` pp) | **`70%` (`7,000` pp)** | `70%` (`35,000` pp) | `70%` (`140,000` pp) |
| **Sarvam Vision Indic/Handwritten Pages (`₹0.50/p`)** | `10%` (`20` pp) | `10%` (`200` pp) | **`10%` (`1,000` pp)** | `10%` (`5,000` pp) | `10%` (`20,000` pp) |
| **Bedrock Input / Output Tokens per Month** | `0.25M / 0.06M` | `2.5M / 0.56M` | **`12.5M / 2.8M`** | `62.5M / 14.0M` | `250.0M / 56.0M` |
| **Voice TTS Previews (`15%` packets × `2,000` chars)** | `9K chars` | `90K chars` | **`450K chars`** | `2.25M chars` | `9.0M chars` |
| **Clinician STT Voice Queries (`10%` packets × `1.5m`)** | `4.5 mins` | `45 mins` | **`225 mins`** | `1,125 mins` | `4,500 mins` |
| **Database Storage Provisioned (`gp3`)** | `20 GB` | `20 GB` | **`30 GB`** (`+0.34 GB/mo` growth) | `100 GB` (`Multi-AZ`) | `250 GB` (`Multi-AZ`) |
| **S3 Accumulated Document Storage** | `1 GB` | `5 GB` | **`15 GB`** (`+3 GB/mo` growth) | `75 GB` | `300 GB` |
