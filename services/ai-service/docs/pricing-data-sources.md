# Medical Bill Pricing Data Sources

These are the initial data sources for Milestone 1 discovery and later pricing/indexing work.

## CMS Hospital Price Transparency MRFs

Source: https://github.com/CMSgov/hospital-price-transparency

Use this for hospital-specific standard charges. CMS states that most U.S. hospitals must publish machine-readable files with standard charges including gross charges, discounted cash prices, payer-specific negotiated charges, and de-identified minimum/maximum negotiated charges.

## CMS Hospital Price Transparency Resources

Source: https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency/resources

Use this to track CMS templates, data dictionaries, file-location requirements, validator guidance, and implementation changes.

## Medicare Physician Fee Schedule

Source: https://www.cms.gov/medicare/physician-fee-schedule/search/documentation

Use this as a Medicare reference-rate source for professional services. Be careful with CPT descriptions because the AMA owns CPT text; store code references unless the business has the right license.

## Transparency in Coverage Files

Source: https://github.com/CMSgov/price-transparency-guide

Use this later for payer negotiated rates and out-of-network allowed amounts. These files are usually very large, so production use should rely on background indexing rather than request-time downloads.

