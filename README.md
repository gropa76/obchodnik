# Obchodník – fáze 1

Osobní appka pro plánování návštěv a poznámky. Čisté HTML, CSS a JavaScript, bez frameworku a bez serveru. Data jsou zašifrovaná a uložená jen v prohlížeči v tomto počítači.

## Co umí

- **Kalendář:** den, týden, měsíc. Návštěvy, schůzky a akce, pořadí trasy (šipky), Hotovo / Odpadlo, přesun odpadlé návštěvy na další den oblasti, odkaz na navigaci v Mapy.cz.
- **Poznámky:** k návštěvě, ke dni, k podniku. Připomínka na zvolený den se objeví v kalendáři. Nevyřízené připomínky po termínu se ukazují v dnešním dni.
- **Podniky:** povinný jen název a adresa. Oblast, frekvence (A týdně, B 14 dní, C měsíčně), kontakt, telefon, číslo v CRM. Hledání bez diakritiky, filtr podle oblasti, řazení podle poslední návštěvy, upozornění na nedoplněné podniky a na „propadlé“ (dlouho bez návštěvy).
- **Detail podniku:** naplánované návštěvy a historie návštěv a poznámek.
- **Nastavení:** oblasti a dny, automatické zamčení, změna hesla.

## Zabezpečení

- Každý záznam je zašifrovaný AES-GCM 256 (Web Crypto API v prohlížeči).
- Datový klíč je zabalený klíčem z hlavního hesla (PBKDF2-SHA256, 600 000 opakování) a zvlášť klíčem z obnovovacího kódu.
- Po odemčení je klíč jen v paměti a nejde exportovat. Zamčení (tlačítko nebo automaticky po nečinnosti) vše z paměti smaže.
- Po 5 špatných pokusech se další pokus odkládá (30 s, pak déle).
- Appka nenačítá nic z cizích serverů (CSP hlavička). Jediný odkaz ven je navigace do Mapy.cz, a to jen když na něj klikneš.

**Důležité:**
1. Obnovovací kód z prvního spuštění si zapiš na papír. Bez hesla i kódu data nikdo neobnoví.
2. Data jsou vázaná na **přesnou adresu** appky (např. `http://localhost:8080`). Jiná adresa = jiné, prázdné úložiště. Vyber si jednu a drž se jí.
3. Smazání dat webů v prohlížeči pro tuto adresu smaže i data appky. Šifrovaná záloha přijde ve fázi 2.
4. Měj na Windows heslo k účtu a zapnuté šifrování disku (BitLocker / Šifrování zařízení).

## Jak spustit na PC

Appka potřebuje běžet přes `http://localhost` nebo `https://` (kvůli šifrování a práci offline). Dvojklik na `index.html` nestačí.

**Varianta A – Python (nejrychlejší):**
1. Otevři složku `obchodnik` v Průzkumníku, do adresního řádku napiš `cmd` a Enter.
2. Spusť: `py -m http.server 8080`
3. V Edge nebo Chrome otevři `http://localhost:8080`

**Varianta B – VS Code:** rozšíření *Live Server*, pravým na `index.html` → *Open with Live Server*. Pozor, port se může měnit, a s ním i úložiště (bod 2 výše).

**Varianta C – GitHub Pages (doporučeno pro trvalé používání):** nahraj složku do repozitáře a zapni Pages. Adresa se nemění, funguje i offline a stejná adresa půjde později otevřít v telefonu. Na GitHubu je jen kód, žádná data.

### Instalace jako aplikace ve Windows
V Edge nebo Chrome klikni v adresním řádku na ikonu **Nainstalovat aplikaci**. Appka pak běží ve vlastním okně a má ikonu v Start menu.

## Struktura

```
index.html            stránka a bezpečnostní hlavička (CSP)
manifest.webmanifest  instalace jako aplikace
sw.js                 práce offline (při úpravách zvyš VERSION)
css/app.css           vzhled
js/util.js            datumy, tvorba prvků (text vždy jako text, nikdy HTML)
js/crypto.js          šifrování, heslo, obnovovací kód
js/db.js              IndexedDB
js/store.js           data v paměti po odemčení
js/model.js           podniky, oblasti, události, poznámky
js/ui.js              dialogy, formuláře, společné akce
js/views/*.js         obrazovky
js/app.js             start, navigace, automatické zamčení
```

## Další fáze

2. Šifrovaná záloha (export a import) – i pro přenos dat do telefonu
3. Nevyřešené (bonusy, smlouvy, protokoly) a návrh týdne
4. Telefon: GPS „Přidat podnik tady“, PIN a otisk prstu
5. Synchronizace a notifikace
