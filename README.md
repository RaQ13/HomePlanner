# Planer domu

Program w przeglądarce do projektowania domu. Rzut 2D rysujesz myszą, a model 3D aktualizuje się na bieżąco.
Program działa bez instalacji i bez serwera: wystarczy otworzyć `index.html` w przeglądarce (Chrome, Chromium, Firefox, Edge).

Wszystkie wymiary są w **centymetrach**.

## Uruchomienie

```
xdg-open index.html        # albo dwuklik na pliku index.html
```

Jeśli przeglądarka blokuje pliki lokalne (np. przy wczytywaniu modeli .glb), uruchom prosty serwer w katalogu programu:

```
python3 -m http.server 8000
# potem otwórz http://localhost:8000
```

Przycisk **Przykład** wczytuje dom przykładowy: parter, piętro, dach i schody.

## Widoki

Przełącznik w prawym górnym rogu: **Rzut 2D**, **2D + 3D** albo **Widok 3D**.

**Rzut 2D**
- Kółko myszy przybliża, a prawy przycisk albo spacja z lewym przyciskiem przesuwa widok. `F` dopasowuje widok do rysunku.
- **Rysunek techniczny** daje biało-czarny rzut:
  - kreskowane ściany;
  - łańcuchy wymiarów zewnętrznych (otwory, narożniki, całość);
  - wymiary pomieszczeń;
  - opisy okien i drzwi (wymiary, parapet, próg) oraz schodów;
  - wysokości pomieszczeń i nagłówek rysunku.
- **Instalacje** wybierasz z listy: ukryte / wszystkie / elektryczna / wod-kan.
- **Tylko instalacje** zostawia ściany jako jasny podkład i pokazuje na nim same przewody i rury.
- **Wymiary instalacji** (widoczne, gdy instalacje są pokazane):
  - przy przewodach i rurach: długość całej trasy, długości odcinków i wysokość;
  - przy punktach na ścianie: odległość wzdłuż ściany do najbliższej ściany poprzecznej i wysokość;
  - przy punktach na suficie i pionach: odległości od najbliższych ścian w obu kierunkach.

  Wysokość w dolnej połowie kondygnacji podaje się od podłogi (`h=30`), a w górnej od sufitu (`30 od sufitu`).
- Na rysunku technicznym widoczne instalacje dostają w nagłówku nazwę branży, a w prawym dolnym rogu legendę użytych symboli.

**Widok 3D**
- Lewy przycisk obraca, prawy przesuwa, kółko przybliża. Przyciski **Perspektywa** i **Z góry** ustawiają kamerę.
- Lista kondygnacji: cały dom, do bieżącej kondygnacji albo tylko bieżąca. Pole **Dach** włącza i wyłącza dachy.
- **Instalacje w ścianach** (wszystkie / elektryczna / wod-kan) robią ściany półprzezroczyste i pokazują przewody i rury w środku.
- **Tylko instalacje** pokazuje budynek jako przezroczysty szkic, a na nim same instalacje.
- **Zaznaczanie**: kliknięcie elementu w 3D zaznacza go do edycji.

**Spacer po domu**

Przeciągnij ludzika z prawego dolnego rogu widoku 3D do pokoju albo na działkę. Widok przełącza się na oczy człowieka (165 cm nad podłogą). Ludzik ląduje na bieżącej kondygnacji. Samo kliknięcie ludzika stawia go w środku widoku.
- **W/S** lub **↑/↓** – naprzód i wstecz, **A/D** – krok w bok, **←/→** lub **Q/E** – obrót, **Shift** – bieg.
- Przeciąganie myszą – rozglądanie się, kółko – przybliżenie, **dwuklik** – przejście we wskazane miejsce.
- Ściany, meble i okna zatrzymują. Stopnie do 45 cm pokonuje się krokiem, więc po schodach wchodzi się na piętro, a rzut 2D przełącza się na kondygnację, na której stoisz.
- Uskok między podłogami pokoi do 1 m (np. korytarz „na poziomie terenu” przy podniesionym parterze) przechodzi się jak po schodkach w drzwiach. Na meble tak się nie wejdzie.
- Pod niskim spocznikiem albo skosem ludzik się schyla. Zatrzymuje się dopiero, gdy wolnej wysokości jest mniej niż 1,2 m. Przez otwór w stropie nad schodami do piwnicy można zejść na schody.
- Na rzucie widać ludzika i jego pole widzenia. Na czas spaceru drzwi są otwarte i widać cały dom.
- **Esc** albo **Zakończ spacer** przywraca poprzedni widok.

## Narzędzia (klawisze)

| Narzędzie | Klawisz | Opis |
|---|---|---|
| Zaznacz | V | Zaznaczanie, przesuwanie, edycja wierzchołków i ścian |
| Ściana | W | Ściany odcinkami; Enter albo prawy przycisk kończy rysowanie; Shift blokuje kąt |
| Pokój | R | Prostokątny pokój ze ścianami |
| Pokój dowolny | P | Pokój o dowolnym obrysie |
| Drzwi / Okno | D / O | Otwór w ścianie; szerokość, wysokość, parapet i próg ustawiasz we Właściwościach |
| Schody | S | Schody proste, L i U z obliczaniem stopni; wysokość spocznika do ustawienia, pod biegiem wolne miejsce, opcja „Zabudowa pod schodami” |
| Komin | K | Komin przechodzący przez kondygnacje i dach |
| Okno dachowe | L | Okno w połaci dachu |
| Lukarna | U | Lukarna na dachu |
| Instalacje | I | Elektryczna i wodno-kanalizacyjna (opis niżej) |
| Meble | E | Katalog mebli i AGD, meble ze zdjęcia, modele .glb |
| Dach | A | Dach dwuspadowy (także łamany), czterospadowy, jednospadowy albo płaski |
| Działka | G | Granica działki i teren (kolor, tekstura); powierzchnia, długości boków |
| Nawierzchnia | N | Chodnik, podjazd, taras, żwir, rabata, trawnik – pas o szerokości albo obszar |
| Płot | Z | Ogrodzenie panelowe, ze sztachet, z desek, pełne/murowane albo z siatki |
| Ogród | Y | Drzewa, krzewy, żywopłot, meble ogrodowe, altana, domek, basen, bramy i furtki |

**Skróty ogólne**
- Ctrl+Z: cofnij. Ctrl+Y albo Ctrl+Shift+Z: ponów.
- Ctrl+C / Ctrl+V: kopiuj i wklej pod kursorem. Ctrl+D: duplikuj.
- Delete: usuń zaznaczony element.
- T: obróć. M: odbij lustrzanie (meble, schody).
- Esc: przerwij rysowanie albo odznacz element.
- Ctrl+S: zapisz projekt do pliku.

Podczas rysowania długość odcinka można wpisać z klawiatury i zatwierdzić Enterem.

## Kondygnacje

Panel **Kondygnacje** po lewej służy do:
- dodawania i usuwania pięter;
- dodawania piwnicy poniżej terenu;
- zmiany wysokości kondygnacji i wysokości ścian;
- podniesienia parteru nad teren;
- kopiowania ścian z kondygnacji niższej.

Pozostałe funkcje:
- **Poddasze**: ściany są przycinane połacią dachu.
- Podłogę pokoju można obniżyć, np. do garażu na poziomie terenu.
- Na rzucie widać jako podkład ściany kondygnacji poniżej.
- Kondygnacja nie jest niższa niż jej najwyższa ściana. Gdy podniesiesz pojedyncze ściany ponad wysokość kondygnacji, strop i kondygnacje powyżej przesuwają się w górę, a na liście kondygnacji widać nową wysokość.

## Tekstury

W **Ustawieniach projektu** przycisk **Dodaj teksturę ze zdjęcia** dodaje zdjęcie do biblioteki tekstur. Teksturę przypisujesz we Właściwościach ścianie, podłodze, sufitowi, oknu, drzwiom, dachowi albo meblowi.

Do wyboru:
- powielanie z rozmiarem kafla albo rozciąganie;
- obrót;
- **spoiny**: szerokość i kolor, albo brak spoin, żeby powielenie było bez kresek.

## Meble

Narzędzie **Meble (E)** otwiera katalog z kategoriami Pokój, Kuchnia, Łazienka, Garaż i Własne.
- **Garaż**: samochody w rzeczywistych wymiarach (długość × szerokość bez lusterek × wysokość):
  - Audi A4 B8 sedan (2008): 470,3 × 182,6 × 142,7 cm, rozstaw osi 280,8 cm;
  - Škoda Fabia sedan (2006, pierwsza generacja): 423,2 × 164,6 × 145,1 cm, rozstaw osi 246,2 cm.

  Lusterka wystają poza obrys, tak jak w prawdziwym aucie. Przy zmianie wymiarów bryła skaluje się proporcjonalnie.
- Mebel przy ścianie sam przylega do niej tyłem. Shift wyłącza to przyleganie.
- We Właściwościach zmieniasz wymiary, kolory, wysokość zawieszenia i teksturę.
- **Mebel ze zdjęcia**: zdjęcie frontu nakładane na bryłę o podanych wymiarach.
- **Model .glb**: import gotowego modelu 3D, skalowanego do podanych wymiarów.

## Działka i ogród

Narzędzia terenu działają na kondygnacji parteru: po wybraniu narzędzia program sam na nią przełącza. Wszystko stoi na poziomie terenu, także przy podniesionym parterze.

- **Działka (G)**: klikasz narożniki granicy, a pierwszy punkt albo Enter zamyka obrys.
  - Na rzucie widać granicę linią kreska–kropka, długości boków, nazwę i powierzchnię w m² i arach.
  - We Właściwościach zmienisz kolor i teksturę terenu (np. trawa) i zobaczysz obwód oraz zabudowę liczoną z obrysu pokoi w osiach ścian, w m² i % działki.
- **Nawierzchnia (N)**: chodnik, podjazd, taras, plac lub opaska, żwir, rabata z kory albo trawnik. Każdy rodzaj ma własną wysokość nad terenem (taras 15 cm), a kolor i teksturę (np. kostkę) ustawiasz we Właściwościach. Kształt rysujesz na dwa sposoby:
  - **pas o szerokości**: klikasz punkty osi chodnika, a program buduje pas z narożnikami;
  - **obszar**: klikasz narożniki.
- **Płot (Z)**: klikasz kolejne punkty. Kliknięcie pierwszego punktu zamyka ogrodzenie dookoła, a Enter albo prawy klik je kończy.
  - Do wyboru płot panelowy, ze sztachet, z desek poziomych, pełny lub murowany (ze słupkami i daszkami) albo z siatki.
  - Ustawiasz wysokość, podmurówkę, rozstaw słupków i kolory.
  - **Tekstury** nakładasz osobno na wypełnienie (np. cegła, deska) i na podmurówkę.
- **Ogród (Y)**: katalog w trzech grupach:
  - **Rośliny**: drzewo liściaste, świerk, drzewo owocowe, tuja, krzew, żywopłot, rabata z kwiatami, donica.
  - **Ogród**: stół i krzesło ogrodowe, ławka, leżak, parasol, grill, altana, domek narzędziowy, basen stelażowy, oczko wodne, trampolina, huśtawka, piaskownica, lampa ogrodowa, pojemniki na odpady, kompostownik.
  - **Bramy**: brama dwuskrzydłowa, brama przesuwna i furtka. Stawia się je w przerwie zostawionej w płocie.

Wierzchołki zaznaczonej działki, nawierzchni lub płotu można przeciągać, a cały element przesuwa się przeciągnięciem. Kopiowanie, usuwanie i cofanie działają jak dla innych elementów.

## Instalacje

Narzędzie **Instalacje (I)** oferuje dwie branże:
- **Elektryczna:** gniazdka (pojedyncze, podwójne, siłowe 400 V), łączniki, kinkiet, puszka rozgałęźna, rozdzielnica, punkt świetlny na suficie oraz przewód (trasa).
- **Wodno-kanalizacyjna:** podejścia wody zimnej (Z), ciepłej (C), odpływ (K), pion kanalizacyjny oraz rury wody zimnej, ciepłej i kanalizacyjnej (trasy).

Stawianie:
- **Punkt na ścianie** stawiasz kliknięciem przy ścianie. Strona kursora wybiera lico ściany. Wysokość jest domyślna, np. gniazdko 30 cm, łącznik 110 cm, woda 50 cm.
- We Właściwościach zmienisz wysokość, odległość od początku ściany i lico („Na drugie lico ściany”). Punkt można przeciągać wzdłuż ściany i na inną ścianę.
- **Trasę** wyznaczasz kolejnymi kliknięciami. Punkty przyciągają się do osi ścian, siatki i punktów instalacji, a Enter albo prawy przycisk kończy rysowanie.
- Przewód biegnie domyślnie 30 cm pod sufitem, a rury nisko nad podłogą.
- W 3D trasa sama schodzi pionowo do punktów, które na niej leżą, np. przewód do gniazdka.
- Usunięcie ściany usuwa także osprzęt na niej.

## Zapis i eksport

- Projekt zapisuje się sam w przeglądarce (localStorage). Biblioteki tekstur i modeli trafiają do IndexedDB.
- **Zapisz** pobiera projekt jako plik `.json`, a **Otwórz** go wczytuje. Pliki `*.json` są w `.gitignore`, więc nie trafiają do repozytorium. Plik nie zawiera biblioteki tekstur i modeli.
- **Obraz PNG** zapisuje bieżący widok: rzut 2D (także jako rysunek techniczny) albo widok 3D.
- **Nowy** zaczyna pusty projekt, a **Przykład** wczytuje dom przykładowy.

## Budowa programu

Zwykły HTML, CSS i JavaScript, bez kompilacji i bez zależności z npm.

```
index.html            układ strony, ładowanie skryptów (?v=… – wymuszenie odświeżenia po zmianach)
css/style.css         wygląd
js/model.js           model projektu (kondygnacje, ściany, pokoje, otwory, obiekty, dachy, instalacje),
                      geometria, cofanie/ponawianie, zapis, biblioteki tekstur i modeli
js/editor2d.js        rzut 2D: rysowanie, narzędzia, przyciąganie, wymiary, rysunek techniczny
js/view3d.js          widok 3D (Three.js): budowa sceny, tekstury, zaznaczanie
js/furniture.js       katalog mebli i AGD, rysowanie mebli na rzucie
js/installs.js        katalog instalacji, symbole na rzucie
js/ui.js              panele, formularze właściwości, katalogi, klawiatura
js/main.js            start programu
js/vendor/            Three.js r147, OrbitControls, GLTFLoader
```

Moduły dzielą wspólny obiekt `window.App` i komunikują się zdarzeniami (`App.on` / `App.emit`): `change`, `select`, `load` itd.
Każda zmiana projektu przechodzi przez `App.edit(() => …)`, które zapisuje stan do historii cofania.

Po zmianie plików JS lub CSS podbij numer `?v=` w `index.html`, żeby przeglądarka nie użyła starej wersji z pamięci podręcznej.
