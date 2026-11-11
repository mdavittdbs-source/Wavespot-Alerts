# SpotOn Station XML Patch via ADB

Typed up from handwritten notes.

## 1. Get the laptop ready

1. Hardwire the laptop into the network with an Ethernet cable. Plug it into either the **Pronto** or a **switch**.
2. Open the folder **Customer folder → Data → CD_Images → SpotOn → ADB with XML Patch → 2X**.
3. Copy the **platform-tools** folder to the root of the `C:` drive (`C:\platform-tools`).

## 2. Run the update script once

4. Run **`XML File Update.bat`**.

## 3. Put the station into developer mode

5. On the station, open Android **Settings → About Device**.
6. Scroll down to **Build Number** and tap it 7–8 times until developer mode turns on.

## 4. Turn on debugging

7. Go to **Settings → System → Developer options** and scroll to the **Debugging** section.
8. Turn on **USB debugging** and **UART debugging**.
   - **Handhelds (HH):** turn on **Wireless debugging** in place of UART debugging.

## 5. Connect and patch

9. Run **`XML File Update.bat`** again.
10. On the station, tick the **Always allow** checkbox, then tap **Allow**.
11. In the `.bat` window, type the **last digits of the station's IP address**.
12. Press **Enter** to verify the connection.
13. Press **Enter** again to update the station.
14. Press **Enter** once more to reboot the station.
