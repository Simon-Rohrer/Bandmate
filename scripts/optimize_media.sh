#!/bin/bash

# =================================================================
# GLOBAL KONFIGURATION
# =================================================================
MAX_VIDEO_SIZE_MB=45 # Zielgröße für Videos
MAX_AUDIO_SIZE_MB=50 # Zielgröße für Audio
VIDEO_EXTENSIONS=(mp4 mov mkv m4v)
IMAGE_EXTENSIONS=(jpg jpeg png)
AUDIO_EXTENSIONS=(mp3 wav)
AUDIO_BITRATE="192k" # Bitrate für Audio-Komprimierung (gute Balance)


# =================================================================
# FUNKTIONEN
# =================================================================

compress_video() {
  local input=$1
  local tmp="${input%.*}-tmp.mp4"

  echo "   ➤ Video: Versuche zu komprimieren: $input"

  # Starte mit CRF 23 und erhöhe bis zu CRF 30
  for crf in 23 26 30; do
    echo "      - Versuche CRF $crf..."
    # FFMPEG-Kommando: Video-Codec libx264, Audio-Codec aac 128k
    ffmpeg -i "$input" -vcodec libx264 -crf $crf -preset medium \
      -acodec aac -b:a 128k "$tmp" -y >/dev/null 2>&1

    # Dateigröße in MB ermitteln
    if [ -f "$tmp" ]; then
        size=$(du -m "$tmp" | cut -f1)
        echo "         -> Ergebnisgröße: $size MB"
    else
        echo "         -> FEHLER: Temporäre Datei $tmp konnte nicht erstellt werden."
        return 1
    fi


    if [ "$size" -le $MAX_VIDEO_SIZE_MB ]; then
      mv "$tmp" "$input"
      echo "      ✔ Final akzeptiert (<${MAX_VIDEO_SIZE_MB} MB)"
      return 0
    fi
  done

  # Falls selbst CRF 30 nicht unter die Zielgröße kommt
  echo "      ⚠ CRF 30 war noch zu groß – nehme letzte Version ($size MB)!"
  mv "$tmp" "$input"
}

compress_image() {
  local img=$1
  echo "   ➤ Bild: Komprimiere: $img"

  # ImageMagick-Kommando: Qualität 80
  magick "$img" -quality 80 "$img-compressed"
  mv "$img-compressed" "$img"

  echo "      ✔ Bildkomprimierung abgeschlossen (Qualität 80)"
}


# NEUE FUNKTION: Audio-Komprimierung (WAV -> MP3 oder MP3 Re-encode)
compress_audio() {
  local input=$1
  local base_name="${input%.*}"
  local current_ext="${input##*.}"
  local tmp_output="${base_name}-tmp.mp3"
  
  # Größe prüfen (mit awk für bessere Kompatibilität)
  local current_size=$(du -m "$input" | awk '{print $1}')

  echo "   ➤ Audio: Prüfe $input (Größe: ${current_size} MB)"

  # WAV-Dateien IMMER konvertieren, da sie für Web ungeeignet sind
  if [[ "$current_ext" == "wav" ]]; then
      echo "      ℹ WAV-Datei erkannt. Erzwinge Konvertierung zu MP3."
  elif [ "$current_size" -le $MAX_AUDIO_SIZE_MB ]; then
    echo "      ✔ Bereits klein genug (<${MAX_AUDIO_SIZE_MB} MB). Überspringe."
    return 0
  fi

  echo "      ⚠ Zu groß! Starte Konvertierung/Komprimierung nach MP3 (${AUDIO_BITRATE})..."

  # Konvertiere/Komprimiere zur temporären MP3-Datei
  ffmpeg -i "$input" -c:a libmp3lame -b:a $AUDIO_BITRATE "$tmp_output" -y >/dev/null 2>&1

  if [ -f "$tmp_output" ]; then
    local new_size=$(du -m "$tmp_output" | cut -f1)
    echo "         -> Neue Größe: ${new_size} MB"

    # Prüfe Zielgröße und ersetze
    if [ "$new_size" -le $MAX_AUDIO_SIZE_MB ]; then
      
      if [[ "$current_ext" == "wav" ]]; then
        rm "$input" # Lösche die große WAV
        mv "$tmp_output" "${base_name}.mp3"
        echo "      ✔ WAV erfolgreich zu MP3 (<${MAX_AUDIO_SIZE_MB} MB) konvertiert."
      
      elif [[ "$current_ext" == "mp3" ]]; then
        rm "$input" # Lösche die alte, große MP3
        mv "$tmp_output" "$input"
        echo "      ✔ MP3 erfolgreich re-encoded (<${MAX_AUDIO_SIZE_MB} MB) und ersetzt."
      fi
      
      return 0
    else
      echo "      ❌ FEHLER: Ergebnis ($new_size MB) ist immer noch zu groß! Ursprüngliche Datei beibehalten."
      rm "$tmp_output"
      return 1
    fi
  else
    echo "      ❌ FEHLER: Konvertierung mit FFmpeg fehlgeschlagen."
    return 1
  fi
}


# =================================================================
# HAUPT-LOGIK: Dateien finden und Typ bestimmen
# =================================================================

echo "🚀 Media Optimizer gestartet!"


# 1. Video-Verarbeitung
echo -e "\n🎬 Schritt 1: Videos komprimieren..."
VIDEO_FIND_COMMAND=$(printf -- '-iname "*.%s" -o ' "${VIDEO_EXTENSIONS[@]}")
VIDEO_FIND_COMMAND=${VIDEO_FIND_COMMAND% -o }

# Der 'find .'-Befehl sorgt# Führt den Find-Befehl aus und leitet jedes Ergebnis an die Funktion
eval "find . -type f \( $VIDEO_FIND_COMMAND \) | while read -r file; do compress_video \"\$file\"; done"
echo "✅ Video-Verarbeitung abgeschlossen."


# 2. Bilder-Verarbeitung
echo -e "\n🖼 Schritt 2: Bilder komprimieren..."
IMAGE_FIND_COMMAND=$(printf -- '-iname "*.%s" -o ' "${IMAGE_EXTENSIONS[@]}")
IMAGE_FIND_COMMAND=${IMAGE_FIND_COMMAND% -o }

# Führt den Find-Befehl aus und leitet jedes Ergebnis an die Funktion
eval "find . -type f \( $IMAGE_FIND_COMMAND \) | while read -r file; do compress_image \"\$file\"; done"
echo "✅ Bilder-Verarbeitung abgeschlossen."


# 3. Audio-Verarbeitung
echo -e "\n🎧 Schritt 3: Audio komprimieren..."
AUDIO_FIND_COMMAND=$(printf -- '-iname "*.%s" -o ' "${AUDIO_EXTENSIONS[@]}")
AUDIO_FIND_COMMAND=${AUDIO_FIND_COMMAND% -o }

# Der 'find .'-Befehl sorgt für die rekursive Suche in allen Unterordnern.
eval "find . -type f \( $AUDIO_FIND_COMMAND \) | while read -r file; do compress_audio \"\$file\"; done"
echo "✅ Audio-Verarbeitung abgeschlossen."

echo -e "\n🎉 Alle Medien optimiert und fertig!"