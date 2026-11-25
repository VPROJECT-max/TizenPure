"""Certificate flow with a mocked Samsung CA: nothing leaves the test."""

import datetime
import os

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from tizenpure import certs


def test_create_profile_with_mocked_ca(tmp_path, monkeypatch):
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Mock CA")])
    posted = []

    def fake_post(url, fields, filename, csr):
        posted.append((url, fields, filename))
        req = x509.load_pem_x509_csr(csr)
        if "v1/distributors" in url:
            return b"<profile/>"
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(req.subject)
            .issuer_name(ca_name)
            .public_key(req.public_key())
            .serial_number(7)
            .not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=30))
            .sign(ca_key, hashes.SHA256())
        )
        return cert.public_bytes(serialization.Encoding.PEM)

    monkeypatch.setattr(certs, "_post", fake_post)
    out = tmp_path / "certs"
    certs.create_profile("FAKE-DUID", str(out), auth={"access_token": "t", "userId": "u", "inputEmailID": "a@b.c"})
    assert certs.has_profile(str(out))
    password = (out / "password.txt").read_text().encode()
    key, cert, _extra = pkcs12.load_key_and_certificates((out / "author.p12").read_bytes(), password)
    assert cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value == "tizenpure"
    assert all(url.startswith("https://svdca.samsungqbe.com/") for url, _f, _n in posted)
    assert os.path.exists(out / "device-profile.xml")
