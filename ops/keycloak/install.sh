#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openjdk-21-jre-headless postgresql curl ca-certificates python3
id keycloak >/dev/null 2>&1 || useradd --system --home /opt/keycloak --shell /usr/sbin/nologin keycloak
install -d -m 750 -o root -g keycloak /etc/keycloak
install -d -m 750 -o keycloak -g keycloak /var/log/keycloak
if [ ! -f /opt/keycloak/version.txt ]; then
 curl -fL --retry 3 https://github.com/keycloak/keycloak/releases/download/26.7.3/keycloak-26.7.3.tar.gz -o /tmp/keycloak.tar.gz
 echo '77657f30b7e90d70f727712ce1c967f430fd6a5e9f458d32d8c6df0635345f47  /tmp/keycloak.tar.gz' | sha256sum -c -
 tar -xzf /tmp/keycloak.tar.gz -C /opt
 mv /opt/keycloak-26.7.3 /opt/keycloak
 echo 26.7.3 > /opt/keycloak/version.txt
 chown -R keycloak:keycloak /opt/keycloak
 rm /tmp/keycloak.tar.gz
fi
systemctl enable --now postgresql
python3 /root/dastari-keycloak/setup-secrets.py
install -d -m 750 -o keycloak -g keycloak /opt/keycloak/data/tmp
install -o keycloak -g keycloak -m 640 /root/dastari-keycloak/dastari-realm.json /opt/keycloak/data/import/dastari-realm.json
runuser -u keycloak -- /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true
install -m 644 /root/dastari-keycloak/keycloak.service /etc/systemd/system/keycloak.service
systemctl daemon-reload
systemctl enable --now keycloak
