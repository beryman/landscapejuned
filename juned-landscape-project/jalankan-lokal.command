#!/bin/bash
# Menjalankan Juned Landscape Project di komputer (untuk uji coba). Klik dua kali di Mac.
cd "$(dirname "$0")"
echo "Buka http://localhost:8080 di browser. Tekan Ctrl+C untuk berhenti."
( sleep 1; open "http://localhost:8080" ) 2>/dev/null &
python3 -m http.server 8080
