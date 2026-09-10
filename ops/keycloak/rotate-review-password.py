"""Rotate only the dedicated, previously provisioned review credential."""
import json
import os
from pathlib import Path
import secrets
import urllib.parse
import urllib.request

REVIEW_ID = "5882b0ce-e450-4e4e-aa5b-bff4ef021893"
REVIEW_USERNAME = "sidereal-review-7aaa4143"

def validate_review(value):
    if value.get("id") != REVIEW_ID or value.get("username") != REVIEW_USERNAME:
        raise ValueError("Refusing to rotate a different account")

def main():
    root = Path("/root/dastari-keycloak")
    credential = root / "sidereal-review.json"
    review = json.loads(credential.read_text())
    validate_review(review)
    admin = json.loads((root / "bootstrap-admin.json").read_text())
    base = "http://127.0.0.1:8080"
    request = urllib.request.Request(base + "/realms/master/protocol/openid-connect/token", data=urllib.parse.urlencode({"client_id": "admin-cli", "grant_type": "password", **admin}).encode())
    with urllib.request.urlopen(request) as response:
        token = json.load(response)["access_token"]
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    account_url = base + "/admin/realms/dastari/users/" + REVIEW_ID
    with urllib.request.urlopen(urllib.request.Request(account_url, headers=headers)) as response:
        validate_review(json.load(response))
    password = secrets.token_urlsafe(36)
    updated = {**review, "password": password}
    pending = root / "sidereal-review-password.pending.json"
    fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(updated, stream)
        stream.flush()
        os.fsync(stream.fileno())
    request = urllib.request.Request(account_url + "/reset-password", headers=headers, method="PUT", data=json.dumps({"type": "password", "value": password, "temporary": False}).encode())
    with urllib.request.urlopen(request) as response:
        if response.status != 204:
            raise RuntimeError("Review credential rotation did not complete")
    os.replace(pending, credential)
    credential.chmod(0o600)
    print("Dedicated review credential rotated; account, roles and existing sessions preserved.")

if __name__ == "__main__":
    main()
