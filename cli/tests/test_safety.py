import pytest
from fixtures import DASHED

from tizenpure import cli, dns, doctor, models, redact, remote


def test_dns_lists_are_safe():
    assert dns.lint() == []


def test_lint_catches_a_list_that_would_break_kept_services():
    problems = dns.lint({"safe": ["samsungotn.net", "netflix.com", "bad domain"]}, dns.load(dns.ALLOWLIST))
    assert any("samsungotn.net" in p for p in problems)
    assert any("netflix.com" in p for p in problems)
    assert any("invalid" in p for p in problems)


def test_export_formats_never_contain_allowlisted_domains():
    allow = dns.load(dns.ALLOWLIST)
    for fmt in dns.FORMATS:
        text = dns.export("aggressive", fmt)
        for domain in allow:
            assert f" {domain}\n" not in text and f"||{domain}^" not in text and f"/{domain}/" not in text


def test_packaged_lists_match_repository_lists():
    from pathlib import Path

    repo = Path(__file__).resolve().parents[2] / "dns"
    for name in ("samsung-ads.txt", "samsung-aggressive.txt", "allowlist.txt"):
        assert (repo / name).read_bytes() == (dns.DATA / name).read_bytes(), name


def test_model_gating():
    assert models.allows("UE55CU7172UXXH", models.STORE_APPS, "9.0")
    assert not models.allows("QE00XX0000", models.STORE_APPS, "9.0")
    assert models.allows("QE00XX0000", models.APP_LEVEL, "9.0")
    assert models.tier("UE55CU7172UXXH", "4.0") == "unsupported"
    assert models.year_from_model_code("23_KSUE_UB_T09") == 2023


def test_redaction():
    text = "tv 192.168.1.20 mac 7c:c3:85:00:00:01 uuid:db2d1027-095e-42e5-824f-68160c307e28 me@example.com"
    out = redact.text(text)
    assert "192.168" not in out and "7c:c3" not in out and "db2d1027" not in out and "example.com" not in out
    assert redact.mapping({"duid": "X", "nested": {"ip": "1.2.3.4", "model": "A"}}) == {
        "duid": "<redacted>",
        "nested": {"ip": "<redacted>", "model": "A"},
    }


class FakeSession:
    def __init__(self, host):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def capability(self):
        return {"platform_version": "9.0", "cpu_arch": "armv7", "architecture": "32", "sdbd_rootperm": "disabled"}

    def duid(self):
        return "FAKE-DUID"

    def applist(self):
        return DASHED


def test_doctor_is_read_only_and_reports(monkeypatch):
    monkeypatch.setattr(
        remote,
        "info",
        lambda host: {
            "modelName": "UE55CU7172UXXH",
            "model": "23_KSUE_UB_T09",
            "developerMode": "1",
            "developerIP": "10.0.0.2",
            "PowerState": "on",
        },
    )
    monkeypatch.setattr(doctor.discover, "local_ipv4", lambda: ["10.0.0.2"])
    report = doctor.run("10.0.0.1", FakeSession)
    assert report["ok"] and report["tier"] == "verified"
    assert report["platform"]["expected_chromium"] == 120
    assert "Netflix" in report["apps"]["keep"]
    assert "FAKE-DUID" not in doctor.render(report)


def test_debloat_refuses_kept_and_protected_apps(monkeypatch, capsys):
    monkeypatch.setattr(cli, "session", FakeSession)
    with pytest.raises(SystemExit, match="streaming"):
        cli.main(["--tv", "10.0.0.1", "debloat", "--remove", "9Ur5IzDKqV", "--apply", "--yes"])
    with pytest.raises(SystemExit, match="protected"):
        cli.main(["--tv", "10.0.0.1", "debloat", "--remove", "com.samsung.tv.SecurityCenter", "--apply", "--yes"])


def test_debloat_is_a_dry_run_by_default(monkeypatch, capsys):
    monkeypatch.setattr(cli, "session", FakeSession)
    cli.main(["--tv", "10.0.0.1", "debloat", "--remove", "yL49PNFmjW"])
    assert "DRY RUN" in capsys.readouterr().out


def test_unverified_models_cannot_debloat(monkeypatch):
    monkeypatch.setattr(cli, "session", FakeSession)
    monkeypatch.setattr(
        cli.remote, "info", lambda host: {"modelName": "QE00XX0000", "model": "x", "developerMode": "1"}
    )
    with pytest.raises(SystemExit, match="Refusing"):
        cli.main(["--tv", "10.0.0.1", "--yes", "debloat", "--remove", "yL49PNFmjW", "--apply"])


def test_install_refuses_foreign_apps_without_opt_in(tmp_path):
    (tmp_path / "config.xml").write_text(
        '<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" version="1.0.0">'
        '<tizen:application id="AbCdEfGhIj.X" package="AbCdEfGhIj"/></widget>'
    )
    with pytest.raises(SystemExit, match="own apps"):
        cli.main(["--tv", "10.0.0.1", "install", str(tmp_path)])
