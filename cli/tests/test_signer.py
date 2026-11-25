import datetime
import os
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from tizenpure import package, signer


def make_profile(folder):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    enc = serialization.BestAvailableEncryption(b"pw")
    for role in ("author", "distributor"):
        with open(os.path.join(folder, f"{role}.p12"), "wb") as f:
            f.write(pkcs12.serialize_key_and_certificates(role.encode(), key, cert, None, enc))
    with open(os.path.join(folder, "password.txt"), "w") as f:
        f.write("pw")
    return key


def test_signs_hello_app_with_both_signatures(tmp_path):
    key = make_profile(tmp_path)
    out = tmp_path / "hello.wgt"
    signer.sign_wgt(str(package.HELLO_DIR), str(out), str(tmp_path))
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        assert names[:2] == ["author-signature.xml", "signature1.xml"]
        assert {"config.xml", "index.html", "icon.png"} <= set(names)
        author = z.read("author-signature.xml").decode()
        dist = z.read("signature1.xml").decode()
    assert 'Id="AuthorSignature"' in author and "role-author" in author
    assert 'URI="author-signature.xml"' in dist and "role-distributor" in dist
    # The signature value verifies against the canonical SignedInfo we emit.
    import base64
    import re

    signed_info = re.search(r"<SignedInfo>.*?</SignedInfo>", author).group(0)
    canonical = signed_info.replace("<SignedInfo>", '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">', 1)
    value = base64.b64decode(re.search(r"<SignatureValue>(.*?)</SignatureValue>", author).group(1))
    key.public_key().verify(value, canonical.encode(), padding.PKCS1v15(), hashes.SHA512())


def test_hello_metadata():
    assert package.metadata(package.HELLO_DIR) == ("TizenPureH.Hello", "TizenPureH", "1.0.0")
