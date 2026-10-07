# Kleiner Dienst, der signal-update.sh nach Zeitplan ausfuehrt.
# Einrichten und aendern: ./signal-update.sh --einrichten
FROM docker:27-cli
RUN apk add --no-cache bash curl tzdata
COPY start.sh /start.sh
RUN chmod +x /start.sh
ENTRYPOINT ["/start.sh"]
