from app.pricing.sources import parse_hospital_price_transparency_txt


def test_parse_hospital_price_transparency_txt_extracts_mrf_location() -> None:
    result = parse_hospital_price_transparency_txt(
        """
        Hospital Name: North Valley Hospital
        Source Page URL: https://example.test/pricing
        Machine Readable File URL: https://example.test/standardcharges.json
        Contact: billing@example.test
        """
    )

    assert result.hospital_name == "North Valley Hospital"
    assert result.machine_readable_file_url == "https://example.test/standardcharges.json"
    assert result.warnings == []

