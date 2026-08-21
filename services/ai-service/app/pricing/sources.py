from app.contracts import HospitalPriceTransparencyLocation, PricingSource


def list_pricing_sources() -> list[PricingSource]:
    return [
        PricingSource(
            name="CMS Hospital Price Transparency Machine-Readable Files",
            source_type="hospital_standard_charges",
            owner="Centers for Medicare & Medicaid Services",
            url="https://github.com/CMSgov/hospital-price-transparency",
            use_case="Hospital-specific gross charges, discounted cash prices, negotiated charges, and allowed amounts where disclosed.",
            update_frequency="Hospitals must update at least annually.",
            notes="Use for benchmarking hospital bills against the provider's own published standard charges.",
        ),
        PricingSource(
            name="CMS Hospital Price Transparency Resources",
            source_type="regulatory_index",
            owner="Centers for Medicare & Medicaid Services",
            url="https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency/resources",
            use_case="Source discovery for CMS templates, TXT file rules, validator guidance, and implementation resources.",
            update_frequency="CMS-maintained.",
            notes="Useful for crawler rules and locating hospital machine-readable file URLs.",
        ),
        PricingSource(
            name="Medicare Physician Fee Schedule",
            source_type="medicare_reference_rate",
            owner="Centers for Medicare & Medicaid Services",
            url="https://www.cms.gov/medicare/physician-fee-schedule/search/documentation",
            use_case="Reference pricing for CPT/HCPCS professional services where Medicare rates are relevant comparators.",
            update_frequency="Annual and periodic CMS releases.",
            notes="CPT descriptions are AMA copyrighted; store only licensed descriptions or code-level references.",
        ),
        PricingSource(
            name="Transparency in Coverage Machine-Readable Files",
            source_type="payer_negotiated_rates",
            owner="Centers for Medicare & Medicaid Services",
            url="https://github.com/CMSgov/price-transparency-guide",
            use_case="Payer in-network negotiated rates and out-of-network allowed amounts for insurance-plan benchmarking.",
            update_frequency="Monthly payer/issuer publication.",
            notes="Large files; production use should rely on indexed datasets or a dedicated ingestion job.",
        ),
    ]


def parse_hospital_price_transparency_txt(text: str) -> HospitalPriceTransparencyLocation:
    values: dict[str, str] = {}
    warnings: list[str] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        normalized_key = key.strip().lower().replace(" ", "_").replace("-", "_")
        values[normalized_key] = value.strip()

    hospital_name = _first(values, "hospital_name", "hospital_location_name", "name")
    source_page_url = _first(values, "source_page_url", "source_url", "page_url")
    mrf_url = _first(
        values,
        "machine_readable_file_url",
        "mrf_url",
        "direct_link_to_machine_readable_file",
        "standard_charges_file_url",
    )
    contact = _first(values, "contact", "hospital_point_of_contact", "point_of_contact")

    if not mrf_url:
        warnings.append("No machine-readable file URL was found in the supplied TXT content.")
    if not hospital_name:
        warnings.append("No hospital name was found in the supplied TXT content.")

    return HospitalPriceTransparencyLocation(
        hospital_name=hospital_name,
        source_page_url=source_page_url,
        machine_readable_file_url=mrf_url,
        contact=contact,
        warnings=warnings,
    )


def _first(values: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        if values.get(key):
            return values[key]
    return None
