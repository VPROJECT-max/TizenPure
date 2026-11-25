# Certificates

2023 and newer Samsung TVs only run sideloaded apps signed with an **author** and a
**distributor** certificate issued by Samsung's developer CA for that TV's DUID (device id).
Self-made Tizen certificates fail with `[118,-12] Invalid certificate chain`.

`tizenpure certs` does what Tizen Studio's Certificate Manager does, without Tizen Studio:

1. Opens Samsung's sign-in page (`account.samsung.com`) in **your** browser. You sign in to
   **your own** account; TizenPure never sees your password.
2. Samsung's page sends a sign-in token to `http://localhost:4794/signin/callback`. Port 4794
   and the client id are Samsung's registered values for this developer flow, not ours.
3. TizenPure creates a key pair on your PC and sends two certificate requests to Samsung's
   developer CA (`svdca.samsungqbe.com`). The distributor request contains your TV's DUID,
   because Samsung binds the certificate to that TV.
4. It writes `author.p12`, `distributor.p12`, `password.txt` and `device-profile.xml` to
   `%APPDATA%\TizenPure\certs\<hash of the DUID>\`, readable only by your user.

Only Samsung is contacted. There is no TizenPure server. Certificates are never committed,
uploaded or shared, and the repository ignores `*.p12` and `password.txt`. Each user
creates their own; never use someone else's.

Self-issued certificates carry the **public** privilege level, which is all TizenPure uses.

To remove them, delete the folder above.
