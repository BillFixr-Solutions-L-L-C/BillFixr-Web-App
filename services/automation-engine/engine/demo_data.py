"""
Curated realistic sample medical bills for testing BillFixr.
Demonstrates classic US healthcare billing errors:
- Duplicate charges
- Upcoding (Level 5 ER)
- Unbundled surgical supplies and routine monitoring
- Extreme chargemaster markups (>1000% of Medicare)
- Potential No Surprises Act balance billing
- Real Clinic FQHC sliding scale and credit overpayment
"""

import json
import os

DEMO_BILLS = [
    {
        "id": "er-metro-general",
        "title": "Emergency Room Visit - Metro General Hospital",
        "subtitle": "Sprained Ankle & Minor Laceration - Severe Upcoding & Duplicates",
        "patient_name": "Alex Johnson",
        "account_number": "MGH-982410-A",
        "provider_name": "Metro General Hospital & Trauma Center",
        "provider_address": "1200 Health Park Blvd, Suite 400, Chicago, IL 60611",
        "provider_phone": "(312) 555-0199",
        "provider_email": "billing-disputes@metro-general.example",
        "statement_date": "2026-08-14",
        "date_of_service": "2026-07-28",
        "is_itemized": True,
        "total_billed": 8640.00,
        "insurance_plan": "BlueCross PPO (Applied deductible)",
        "insurance_paid": 0.00,
        "patient_due": 8640.00,
        "notes": "Patient presented with twisted ankle while jogging and a minor 2cm superficial skin cut. No fractures or head trauma.",
        "line_items": [
            {
                "line_id": "L1",
                "date": "2026-07-28",
                "cpt_code": "99285",
                "revenue_code": "0450",
                "description": "Emergency Dept Visit - Level 5 (High Complexity/Immediate Threat)",
                "quantity": 1,
                "charge_amount": 3850.00,
                "medicare_benchmark": 242.00,
                "category": "Emergency Room Evaluation"
            },
            {
                "line_id": "L2",
                "date": "2026-07-28",
                "cpt_code": "85025",
                "revenue_code": "0300",
                "description": "Complete Blood Count (CBC) with Automated Differential",
                "quantity": 1,
                "charge_amount": 280.00,
                "medicare_benchmark": 11.50,
                "category": "Laboratory"
            },
            {
                "line_id": "L3",
                "date": "2026-07-28",
                "cpt_code": "85025",
                "revenue_code": "0300",
                "description": "Complete Blood Count (CBC) with Automated Differential (Duplicate)",
                "quantity": 1,
                "charge_amount": 280.00,
                "medicare_benchmark": 11.50,
                "category": "Laboratory"
            },
            {
                "line_id": "L4",
                "date": "2026-07-28",
                "cpt_code": "73610",
                "revenue_code": "0320",
                "description": "Radiologic Exam, Ankle; Complete, Minimum of 3 Views",
                "quantity": 1,
                "charge_amount": 620.00,
                "medicare_benchmark": 46.20,
                "category": "Radiology"
            },
            {
                "line_id": "L5",
                "date": "2026-07-28",
                "cpt_code": "96374",
                "revenue_code": "0260",
                "description": "Therapeutic IV Push Injection, Initial Substance",
                "quantity": 1,
                "charge_amount": 420.00,
                "medicare_benchmark": 62.00,
                "category": "Nursing / Administration"
            },
            {
                "line_id": "L6",
                "date": "2026-07-28",
                "cpt_code": "99070",
                "revenue_code": "0270",
                "description": "IV Start Kit, Catheter & Disposable Tubing Supplies",
                "quantity": 1,
                "charge_amount": 390.00,
                "medicare_benchmark": 0.00,
                "category": "Medical Supplies"
            },
            {
                "line_id": "L7",
                "date": "2026-07-28",
                "cpt_code": "12001",
                "revenue_code": "0360",
                "description": "Simple Repair of Superficial Wound (2.5 cm or less)",
                "quantity": 1,
                "charge_amount": 960.00,
                "medicare_benchmark": 142.00,
                "category": "Surgical Procedure"
            },
            {
                "line_id": "L8",
                "date": "2026-07-28",
                "cpt_code": "J0131",
                "revenue_code": "0250",
                "description": "Acetaminophen IV / Oral Ibuprofen 800mg Unit Dose",
                "quantity": 1,
                "charge_amount": 140.00,
                "medicare_benchmark": 4.50,
                "category": "Pharmacy"
            },
            {
                "line_id": "L9",
                "date": "2026-07-28",
                "cpt_code": "",
                "revenue_code": "0450",
                "description": "Emergency Department Facility Operating Surcharge",
                "quantity": 1,
                "charge_amount": 1700.00,
                "medicare_benchmark": 310.00,
                "category": "Facility Fee"
            }
        ]
    },
    {
        "id": "surgery-valley-ortho",
        "title": "Outpatient Knee Surgery - Valley Surgical Center",
        "subtitle": "Knee Arthroscopy - Unbundled Surgical Trays & Global Period Overlap",
        "patient_name": "Morgan Davis",
        "account_number": "VSC-77319-K",
        "provider_name": "Valley Surgical Pavilion LLC",
        "provider_address": "8800 Crestview Way, Austin, TX 78759",
        "provider_phone": "(512) 555-8820",
        "provider_email": "patientbilling@valley-surgical.example",
        "statement_date": "2026-09-02",
        "date_of_service": "2026-08-19",
        "is_itemized": True,
        "total_billed": 14850.00,
        "insurance_plan": "Aetna Choice POS II",
        "insurance_paid": 2100.00,
        "patient_due": 12750.00,
        "notes": "Elective outpatient right knee arthroscopy with partial meniscectomy. In-network facility with out-of-network assistant provider charge.",
        "line_items": [
            {
                "line_id": "L1",
                "date": "2026-08-19",
                "cpt_code": "29881",
                "revenue_code": "0490",
                "description": "Arthroscopy, Knee, Surgical; with Meniscectomy (Medial or Lateral)",
                "quantity": 1,
                "charge_amount": 7900.00,
                "medicare_benchmark": 1240.00,
                "category": "Primary Surgery"
            },
            {
                "line_id": "L2",
                "date": "2026-08-19",
                "cpt_code": "01402",
                "revenue_code": "0370",
                "description": "Anesthesia for Open or Endoscopic Knee Procedures",
                "quantity": 1,
                "charge_amount": 2100.00,
                "medicare_benchmark": 365.00,
                "category": "Anesthesia"
            },
            {
                "line_id": "L3",
                "date": "2026-08-19",
                "cpt_code": "99070",
                "revenue_code": "0272",
                "description": "Sterile Surgical Tray, Specialized Drape & Instrument Pack",
                "quantity": 1,
                "charge_amount": 1250.00,
                "medicare_benchmark": 0.00,
                "category": "Surgical Supplies"
            },
            {
                "line_id": "L4",
                "date": "2026-08-19",
                "cpt_code": "94760",
                "revenue_code": "0460",
                "description": "Noninvasive Ear or Pulse Oximetry for Oxygen Saturation",
                "quantity": 1,
                "charge_amount": 350.00,
                "medicare_benchmark": 0.00,
                "category": "Monitoring"
            },
            {
                "line_id": "L5",
                "date": "2026-08-19",
                "cpt_code": "99214",
                "revenue_code": "0510",
                "description": "Office/Outpatient Visit, Established Patient, Moderate Complexity",
                "quantity": 1,
                "charge_amount": 650.00,
                "medicare_benchmark": 135.00,
                "category": "Consultation"
            },
            {
                "line_id": "L6",
                "date": "2026-08-19",
                "cpt_code": "C1713",
                "revenue_code": "0278",
                "description": "Anchor/Screw, Non-absorbable / Bioabsorbable Fixation Device",
                "quantity": 1,
                "charge_amount": 2600.00,
                "medicare_benchmark": 480.00,
                "category": "Implant"
            }
        ]
    }
]

def get_demo_bill(bill_id: str):
    for b in DEMO_BILLS:
        if b["id"] == bill_id:
            return b
    return DEMO_BILLS[0]
