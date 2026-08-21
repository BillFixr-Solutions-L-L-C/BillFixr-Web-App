# Synthetic Email Samples

These `.eml` files are generated demo emails with public sample PDFs attached.

- `north-valley-hospital-statement.eml`
- `resnick-hospital-statement.eml`
- `insurer-eob-notice.eml`

Use them with:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/ingestion/email/message \
  -F file=@samples/emails/north-valley-hospital-statement.eml
```

They are safe for demos because they are synthetic mailbox messages and do not contain real patient emails.
