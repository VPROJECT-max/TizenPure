"""Read app metadata, sign, install and verify a Tizen web app (.wgt or folder)."""

import os
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from tizenpure import catalog, signer

TIZEN_NS = "{http://tizen.org/ns/widgets}"
PACKAGE_ID = re.compile(r"^[A-Za-z0-9]{10}$")
DEFAULT_TOOL_PATH = "/home/owner/share/tmp/sdk_tools"
SAFE_TOOL_PATH = re.compile(r"(?:/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+/?")
INSTALL_ERROR = re.compile(r"\b(?:fail(?:ed|ure)?|error|denied|cannot)\b|\bcan\s+not\b", re.I)
HELLO_DIR = Path(__file__).with_name("hello")


def read_config(src):
    path = Path(src)
    if path.is_dir():
        xml = (path / "config.xml").read_bytes()
    elif path.is_file() and path.suffix.lower() == ".wgt":
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("config.xml")
    else:
        raise ValueError(f"Not an app folder or .wgt file: {src}")
    return ET.fromstring(xml)


def metadata(src):
    """(app_id, package_id, version) from config.xml, validated."""
    root = read_config(src)
    application = root.find(f"{TIZEN_NS}application")
    if application is None:
        raise ValueError("config.xml has no <tizen:application>.")
    app_id, package_id = application.get("id", ""), application.get("package", "")
    if not PACKAGE_ID.fullmatch(package_id) or not app_id.startswith(package_id + "."):
        raise ValueError("config.xml has an invalid package or application id.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", app_id):
        raise ValueError("config.xml has an invalid application id.")
    return app_id, package_id, root.get("version")


def verify_install(app_id, version, output, applist):
    """Read-back: the TV must list exactly this app (and version) after install."""
    statuses = []
    for line in output.splitlines():
        if re.fullmatch(rf"\s*install\s+{re.escape(app_id)}\s*", line) or re.fullmatch(
            r"\s*package_path\s+\S+\s*", line
        ):
            continue  # ids and filenames may contain words such as "error"
        statuses.append(re.sub(r"app_id\[[A-Za-z0-9_.-]+\]", "", line))
    if INSTALL_ERROR.search("\n".join(statuses)):
        raise ValueError("The TV reported an installation error (see its reply above).")
    installed = next((a for a in catalog.parse_applist(applist) if a["appid"] == app_id), None)
    if installed is None:
        raise ValueError(f"The TV does not list {app_id} after installing.")
    if version and installed.get("version") and installed["version"] != version:
        raise ValueError(f"The TV reports version {installed['version']}; expected {version}.")
    return installed


def tool_path(session):
    path = session.capability().get("sdk_toolpath", DEFAULT_TOOL_PATH)
    if not SAFE_TOOL_PATH.fullmatch(path):
        raise ValueError("The TV reported an invalid SDK tools path.")
    return path.rstrip("/")


def install(session, src, cert_dir, workdir):
    """Sign `src` with this TV's profile, push it, install it and verify by read-back."""
    app_id, _package, version = metadata(src)
    remote_dir = tool_path(session)
    signed = Path(workdir) / f"{app_id.split('.')[0]}-signed.wgt"
    signer.sign_wgt(str(src), str(signed), str(cert_dir))
    with open(os.path.join(cert_dir, "device-profile.xml"), "rb") as handle:
        session.push(handle.read(), f"{remote_dir}/device-profile.xml")
    output = session.install(app_id, signed.read_bytes(), remote_dir)
    return output, verify_install(app_id, version, output, session.applist())


def uninstall(session, app_id):
    """Remove one of *our* apps and verify it is gone."""
    package_id = app_id.split(".")[0]
    if package_id not in catalog.OWN_PACKAGES:
        raise ValueError(f"TizenPure only uninstalls its own apps ({', '.join(sorted(catalog.OWN_PACKAGES))}).")
    output = session.uninstall(app_id)
    still = any(a["appid"] == app_id for a in catalog.parse_applist(session.applist()))
    if still:
        raise ValueError(f"{app_id} is still installed. TV said: {output.strip()[-200:]}")
    return output
