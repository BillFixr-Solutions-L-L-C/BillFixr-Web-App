# Public Sample Documents

These files are public sample/educational documents for Milestone 1 demos. They are not real patient mailbox exports.

## Downloaded Samples

- `cms-sample-explanation-of-benefits.pdf`
  - Source: https://www.cms.gov/files/document/11819-sample-explanation-benefits-508.pdf
  - Use: EOB classification and extraction demo.

- `childrens-colorado-sample-billing-statement.pdf`
  - Source: https://www.childrenscolorado.org/globalassets/your-visit/billing-statement.pdf?v=49f359
  - Use: hospital statement ingestion demo.

- `childrens-colorado-sample-billing-statement-spanish.pdf`
  - Source: https://www.childrenscolorado.org/globalassets/your-visit/billing-statement-span.pdf?v=49f361
  - Use: multilingual hospital statement ingestion demo.

- `iu-health-sample-consolidated-statement.pdf`
  - Source: https://cdn.iuhealth.org/resources/how_to_read-your_consolidated_statement_2021_210118_194455.pdf
  - Use: consolidated patient statement ingestion demo.

- `main-line-health-sample-bill.pdf`
  - Source: https://www.mainlinehealth.org/-/media/files/pdf/basic-content/patient-services/patient-billing/sample-bill.pdf
  - Use: billing statement ingestion demo.

- `ucla-health-hospital-statement.pdf`
  - Source: https://www.uclahealth.org/sites/default/files/documents/ucla-health-hospital-statement_1.pdf
  - Use: hospital statement ingestion demo.

- `ucla-resnick-hospital-statement.pdf`
  - Source: https://www.uclahealth.org/sites/default/files/documents/ucla-Resnick-hospital-statement.pdf
  - Use: hospital statement ingestion demo.

## Synthetic Emails

The files in `samples/emails/` are synthetic `.eml` wrappers around these public PDFs. They exist so the email-ingestion pipeline can be demonstrated without using real patient emails or PHI.

## Blocked/Unavailable

- Mayo Clinic sample PDFs were visible through the browser, but direct `curl` downloads returned small HTML protection responses in this environment.
- Virginia Victims Fund sample itemized bills were visible through web search, but local DNS resolution for `vvf.virginia.gov` failed from this environment.
- Kaggle datasets require Kaggle authentication/API credentials and were not downloaded.
