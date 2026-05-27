# Anleitung: Menü und Preise anpassen

Da die Speisekarte für extrem schnelle Ladezeiten direkt im Code hinterlegt ist, kannst du Preise, Namen und neue Artikel jederzeit in wenigen Sekunden selbst anpassen.

## Schritt 1: Datei ändern
1. Öffne im VS Code (oder deinem Texteditor) die Datei:
   `flussschaenke/js/data/menu.js`
2. Dort siehst du die Liste mit allen Artikeln.
3. Ändere einfach den Preis oder den Namen. 
   *(Beispiel: Aus `Preis: 15.00` machst du `Preis: 16.50`)*
4. Wenn du einen **neuen Artikel** hinzufügen willst, kopierst du einfach eine Zeile, fügst sie unten an und gibst ihr eine neue, bisher ungenutzte `Artikel_ID`.
5. Speichere die Datei (auf dem Mac mit `Cmd + S`).

## Schritt 2: Änderungen hochladen (Deploy)
1. Öffne das Terminal in VS Code (oben im Menü auf **Terminal > Neues Terminal** klicken).
2. Tippe folgenden Befehl ein, um die Änderungen zu speichern (du kannst den Text in den Anführungszeichen beliebig anpassen):
   ```bash
   git commit -am "Menüpreise angepasst"
   ```
   *Drücke Enter.*
3. Lade die Änderungen auf deinen Live-Server hoch, indem du tippst:
   ```bash
   git push
   ```
   *Drücke Enter.*

## Schritt 3: Fertig!
Sobald der Upload fertig ist, übernimmt dein GitHub Action Skript im Hintergrund die Arbeit und lädt es auf `pinkpenguin.ch` hoch. Nach ca. 10 bis 30 Sekunden kannst du die Webseite auf dem Handy neu laden (ggf. Cache leeren) und die neuen Preise sind live!
