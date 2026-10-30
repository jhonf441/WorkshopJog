# WorkshopJog -- historial de versiones

## 3.13.31 -- 2026-10-29

- Phone layout fixes (44 px touch targets, no overflow), Workbench full-screen section picker, clamps hint, interrupted jobs off the table, Machine scale label

## 3.13.30 -- 2026-10-29

- Audit and UX fixes: Jog owns workzeroaxis.g, restart notice with time, shared pulse table with update and download, side bar tooltips, spacing, wider field

## 3.13.29 -- 2026-10-29

- State chips with an icon: the icon carries the color and there is no dot (family.css); chosen chip tinted

## 3.13.28 -- 2026-10-28

- Design family: final shared styles

## 3.13.27 -- 2026-10-28

- Design family: the tabs and buttons of the panel and the settings sheet are the shared wf-tab / wf-btn classes (buttons 32 px high); the floating panel keeps its dark look and shadow

## 3.13.26 -- 2026-10-28

- Minimalist design: neutral header bar, flat knob without gradient, text tabs in settings, outline secondary buttons

## 3.13.25 -- 2026-10-28

- Risk dialogs get their colored side bar back; one type scale (Roboto in the panels, no half sizes)

## 3.13.24 -- 2026-10-27

- Plan warnings in words, risk dialogs in DWC style, mesh point selection, link to Machine modes

## 3.13.23 -- 2026-10-27

- Side bar no longer makes the page jump when a shorter section is chosen; start-up chip as in every page (header, same wording)

## 3.13.22 -- 2026-10-26

- Run-time guard: the 3.6 build refuses to start on a host with window.DWC and the 3.7 build outside DWC 3.7.x (visible warning); shipped as a strict per-line zip (dwcVersion 3.6 / 3.7)

## 3.13.21 -- 2026-10-26

- Universal zip: the DWC 3.6 side is now built with the official 3.6 pipeline, so its i18n catalogs are registered and the menu captions show names instead of raw plugins.* keys.

## 3.13.20 -- 2026-10-26

- Jog: the More button is hidden when every extra (Advanced sections, macro buttons) is hidden, and closes if it empties while open

## 3.13.19 -- 2026-10-24

- Start-up assistant: active lines highlighted, single-step way back, dark select options; Lights time picker and defaults; Vision relay message; Printing FFF switch; Mesh handles above the points

## 3.13.18 -- 2026-10-24

- Jog: the not-homed notice floats instead of growing the panel over the buttons; no warning when M564 H0 lets the machine move

## 3.13.17 -- 2026-10-24

- Start-up card reports its pending count to the service (machine setup list)

## 3.13.16 -- 2026-10-23

- One sign-in for every tab (token in localStorage)

## 3.13.15 -- 2026-10-23

- No support for older versions: old keys, ids and events removed; numeric PIN field

## 3.13.14 -- 2026-10-22

- Pin on every side bar, thin scrollbars, one sign-in dialog

## 3.13.13 -- 2026-10-22

- Pin on every side bar, thin scrollbars everywhere

## 3.13.12 -- 2026-10-22

- Sign-in never opens by itself; keyboard only on touch

## 3.13.11 -- 2026-10-22

- Fix names, values and catalog markers the English rename left behind

## 3.13.10 -- 2026-10-22

- Camera images that cannot load say why

## 3.13.9 -- 2026-10-22

- Sessions made clear: not-signed-in chip, sign-in on visitor 403, refusal toast

## 3.13.8 -- 2026-10-22

- Position card follows the movement: 100 ms poll

## 3.13.7 -- 2026-10-22

- Sign-in dialog focus and kiosk keyboard helper; Jog blocked touches explained

## 3.13.6 -- 2026-10-22

- A touch on the ring or sliders while blocked says why and asks for the session

## 3.13.5 -- 2026-10-22

- Kiosk keyboard helper call, sign-in dialog font

## 3.13.4 -- 2026-10-22

- Jog and bars tell why an action is blocked and ask for the session; Jog loses the Machine pointer sections

## 3.13.3 -- 2026-10-22

- Sign-in dialog redesign and on-screen keyboard; single floating panel for power actions; risk bar on one line; Jog gear and scrollbar; side tabs transition

## 3.13.2 -- 2026-10-21

- PIN sign enters by itself when the PIN has the length that worked last time

## Unreleased

- Limits, Coordinates and Probing sections are a read-only pointer to the Machine page (Machine v2 phase 5, design Q3); their editing UI and texts were removed, the pure functions stay

## 3.13.1 -- 2026-10-21

- Page routes in English with redirects from the old ones, localStorage keys migrated to English; console history key migrated

## 3.13.0 -- 2026-10-21

- By role (F3-J): an operator sees the core (move, step, speed, home, STOP, who has the control, the macro buttons); technician and admin also get the Advanced tab, the response of the machine and the maker of macro buttons; a viewer sees the position and STOP only. Same operations as the service table (jog.xy, settings.set, motors.disable); no identity = the full view
- Release of an axis uses motors.disable (the same operation as Motors, with its level 4 confirmation) instead of M18
- The crash sensitivity and the minimum speed are no longer edited in the Jog (only in Motors); a shortcut to Motors for technician and admin
- The Jog no longer ships its own light / air example macros (the bar owns them); a macro button that copies a bar button is not drawn twice

## 3.12.0 -- 2026-10-21

- English migration: texts through the catalog, no in-browser translator, interfaces per part

## 3.11.0 -- 2026-10-21

- Start-up first in the gear sheet; optional zoom in the bar

## 3.10.1 -- 2026-10-20

- English names: remaining values, ids, theme panels and the Vision backend keys (fixes a mismatch with the page)

## 3.10.0 -- 2026-10-20

- All the code, data keys and enum values are in English; stored data is converted by the one-off migration script

## 3.9.0 -- 2026-10-20

- Start-up chip in the header: failsafe macro and the air and light macros

## 3.8.15 -- 2026-10-19

- Jog design 2: Go to boxes show the current position as placeholder; Advanced tab says when all sections are hidden

## 3.8.14 -- 2026-10-18

- Internal: local names in English (no visible change)

## 3.8.13 -- 2026-10-17

- Minimize button keeps the rounded corners of its neighbours (border radius 11 px so the painted radius is 4 px)

## 3.8.12 -- 2026-10-16

- Advanced sections: header icon is drawn with currentColor (the control-by-axis icon was black on dark and left a blank gap that looked like shifted text)

## 3.8.11 -- 2026-10-16

- zsurface.g: the not-comparable message is split into three short ones (the long one failed with Failed to serialize code and stopped the macro)

## 3.8.10 -- 2026-10-16

- Map toolbar buttons keep their icon after a click and no longer overflow; the active zone cannot be deleted (it stays listed anyway)

## 3.8.9 -- 2026-10-16

- Jog minimize button: the unpainted finger border really is unpainted now, so the button looks like the gear

## 3.8.8 -- 2026-10-16

- Jog header: the minimize and padlock buttons are the same size as the gear; the finger target stays large with an unpainted border

## 3.8.7 -- 2026-10-16

- Jog header: the no-limits chip is a small padlock icon so the title and the minimize button are visible again; Workbench: pure helpers of the laser editor and the mesh moved to their own files

## 3.8.6 -- 2026-10-16

- One shared way to start a job file (cuts, mesh, big pieces, CNC) that also reports an error answer; Jog step tab only shows the axes the machine has; Printing mode macros have assistant questions

## 3.8.5 -- 2026-10-16

- Start-up dialog: sans-serif font, dark scrollbars, and a card with a single ready row no longer repeats its name

## 3.8.4 -- 2026-10-16

- Zone card finds material macros made with T (mdf3mm.g) and offers Measure and focus; zsurface.g explains what it measured when the bed has no compensation; the bottom status bar only sticks on tall screens; Jog minimize button is 40 px and works with a finger

## 3.8.3 -- 2026-10-16

- Editing a file from the start-up dialog hides the dialog and brings it back on the same step; Jog hides Home for axes the machine does not have

## 3.8.2 -- 2026-10-16

- Jog: More hidden when there is nothing in it; axis max line removed from More

## 3.8.1 -- 2026-10-16

- Limits: speed and jerk read in mm/min (no x60); Advanced section titles aligned left

## 3.8.0 -- 2026-10-16

- Advanced mode: coordinates and origins, probing, console + log + limits, axis / mode control; mode-agnostic; free-move switch next to the gear; pinned position bar

## 3.7.1 -- 2026-10-15

- Rebuilt with the shared start-up card piece

## 3.7.0 -- 2026-10-15

- Jog: Advanced tab removed (macro buttons are a collapsible section)

## 3.6.6 -- 2026-10-15

- Straight mode: the Y slider moved the opposite way to the knob

## 3.6.5 -- 2026-10-15

- Start-up list of the example macros: state, edit, create, hide

## 3.6.4 -- 2026-10-15

- State of a macro button with an optional off action

## 3.6.3 -- 2026-10-15

- Spanish texts with accents and enie

## 3.6.2 -- 2026-10-15

- Remove the keyboard workaround (kiosk.hide_keyboard): the ghost-tap fix is enough

## 3.6.1 -- 2026-10-15

- Closing a floating panel swallows the rest of the same tap so it cannot reach a text field underneath

## 3.6.0 -- 2026-10-14

- Air and light become macro buttons with commented examples and an Edit file button; keyboard mode and moving buttons follow the blocking rules

## 3.5.5 -- 2026-10-14

- Quick buttons: the live job name is shown only when it differs from the default; the labels fit by font size instead of showing dots; no mentions of removed names

## 3.5.4 -- 2026-10-14

- Effects of the state indicator change at the exact edge of each phase (no extra frames)

## 3.5.3 -- 2026-10-14

- Home / X / Y / Z / Probe quick buttons keep their text inside the box

## 3.5.2 -- 2026-10-14

- Home / X / Y / Z / Probe quick buttons keep their text inside the box

## 3.5.1 -- 2026-10-14

- Cleanup: no more lookups of the old service Id or mentions of the removed custom G-codes

## 3.5.0 -- 2026-10-14

- Home bar: the "Sonda" button (G30 S-1, measures the surface under the head and says the height, changes no zero) replaces "Subir Z"; style 2: the centre of the arrow cross is a button that goes to X0 Y0 of the active zone (two taps, workzero.g raises Z first); the pinned position bar is flush with the status bar and its data wrap whole instead of being cut

## 3.4.2 -- 2026-10-14

- The pinned position bar uses less space so it fits the panel

## 3.4.1 -- 2026-10-14

- The pinned position and speed bar fits in the panel (compact text)

## 3.4.0 -- 2026-10-13

- Smaller: it carries only what it uses of the shared base (files, help and laser.json) and its own four SD macros; the cut area, saved positions and the other macros are only in the Work table

## 3.3.1 -- 2026-10-13

- The pinned position and speed bar appears as soon as the X Y Z numbers scroll out of view

## 3.3.0 -- 2026-10-13

- Position and speed stay pinned under the status bar when the position card scrolls away (the content keeps scrolling normally); no double line at the top of the Avanzado tab

## 3.2.0 -- 2026-10-13

- Step buttons in three groups, faint hub in the cross centre

## 3.1.1 -- 2026-10-13

- Files and macros written by the plugin are in English; bilingual risk texts

## 3.1.0 -- 2026-10-13

- Fixed status bar under the header, Home / X / Y / Z / raise Z in the bottom bar (no Home tab), arrows for X/Y bring the Z buttons, official localization completed

## 3.0.1 -- 2026-10-13

- Fix: the controls chosen in Settings are the only ones shown (the saved knob / tracks mode no longer brings back a hidden control), no empty cells in the Z column or the cross (the centre shows the step), and More no longer repeats the Paso, Velocidad and Home / Home Z that are already in the main view

## 3.0.0 -- 2026-10-13

- Needs WorkshopService 2.0: calls its central API (POST /machine/WorkshopService/api) instead of custom G-codes
- Jog moves, stops and the mode without limits through jog.* operations; a block or a confirmation comes from the single owner of the movement of the service
- Moving G-code (home, go to, macros that move) asks the owner of the movement first; the jog is also blocked while another page holds a reservation or the G-code bridge sends orders
- Includes the i18n helper fix of 1.x (the helper no longer clashes with local variables named tt)


## 2.4.0 -- 2026-10-13

- Official DWC localization and build pipeline

## 2.3.0 -- 2026-10-13

- Activity: camera of notifications, detailed history; Jog: no status lights in the header

## 2.2.1 -- 2026-10-13

- Jog: quick row Home / Home Z / raise Z next to STOP

## 2.2.0 -- 2026-10-13

- Jog: no work areas or saved positions (Workbench has them); STOP pinned; per-axis go to zero; settings per design with a single restore

## 2.1.8 -- 2026-10-13

- Sidebar closed rail and settings; shared updates; English texts pending

## 2.1.7 -- 2026-10-12

- Jog: atiende las respuestas del servicio (bloqueado, confirmar), lee jogBloqueo, sin zoom con los dedos en el kiosko, laserfocus con la ruta nueva; dwcVersion 3.6

## 2.1.6 -- 2026-10-12

- Jog: el G90 al soltar nunca se pierde, se niega a mover con trabajo de archivo o en vivo o con actividad del puente, estado por la suscripcion de DWC

## 2.1.5 -- 2026-10-12

- Jog nunca tapa la parada de emergencia, sin toque fantasma; tarjetas de zonas no se redibujan mientras se escribe; traza con latido solo con la vista abierta; boton Cerrar trabajo; sin zoom con los dedos en el kiosko; dwcVersion 3.6

## 2.1.4 -- 2026-10-11

- Traducciones nuevas (barra de Vision, aviso del jog sin limites)

## 2.1.3 -- 2026-10-11

- Teclado como control unico de X/Y y Z; el parpadeo del modo sin limites se ve tambien con el tema claro

## 2.1.2 -- 2026-10-11

- Traducciones del detalle del PID

## 2.1.1 -- 2026-10-11

- Traducciones nuevas; el traductor tambien cubre Impresion 3D, Timelapses y Servicio de la Pi

## 2.1.0 -- 2026-10-11

- Teclado como control (Ajustes > Controles para mover): dibuja las teclas con su animacion en los dos disenos; desactivado en pantallas tactiles; sale la seccion Teclado vieja

## 2.0.0 -- 2026-10-11

- Solo el panel Jog: la Mesa de trabajo paso a su propio complemento (WorkshopWorkbench). Lo que usan los dos esta en src/_workbench_base

## 1.89.2 -- 2026-10-11

- Hallar centro: cuadro del mapa arriba del toque

## 1.89.1 -- 2026-10-11

- Hallar centro: se abre el cuadro al tocar el mapa

## 1.89.0 -- 2026-10-11

- Hallar centro mas facil: tipo y metodo arriba, elegir el punto en el dibujo, cuadro al tocar el mapa

## 1.88.0 -- 2026-10-11

- Mapa: Capas flota y se cierra sola, Ajustes del mapa aparte, botones sin nombre si no entran en una fila

## 1.87.1 -- 2026-10-11

- Limites y velocidad de la tarjeta de posicion bajan de linea en vez de cortarse

## 1.87.0 -- 2026-10-11

- Una sola tarjeta de posicion arriba en las dos opciones, con limites y velocidad; Mas ya no la repite

## 1.86.1 -- 2026-10-11

- Por defecto en Diseno del jog deja la opcion elegida como viene de fabrica

## 1.86.0 -- 2026-10-11

- Carpetas en ingles bajo 0:/sys/workshop (datos, disenos, malla, cortar por partes); arreglos de la Mesa de trabajo

## 1.85.0 -- 2026-10-11

- Id nuevo en ingles (Workshop...) y guardado seguro ante cortes de luz

## 1.84.0 -- 2026-10-11

- Id nuevo en ingles (Workshop...) y guardado seguro ante cortes de luz

# TallerJog -- historial de versiones

## 1.83.5 -- 2026-10-11

- Un solo control para Z (deslizante o botones), como para X e Y

## 1.83.4 -- 2026-10-11

- Compatibilidad con los Id nuevos en ingles (etapa 1, sin cambiar el Id); Motores: tabla de referencias del techo de pulsos

## 1.83.3 -- 2026-10-10

- Pieza grande: el diseno se ve en el mapa (verde lo que entra, naranja lo que falta)

## 1.83.2 -- 2026-10-10

- Perilla, deslizantes y Z centrados (Z+/Z- en la misma fila); boton Por defecto en cada ajuste; traducciones

## 1.83.1 -- 2026-10-10

- Controles para mover: X/Y es un solo control a elegir (perilla, deslizantes o flechas); Z puede tener los dos

## 1.83.0 -- 2026-10-10

- Jog: controles para mover elegibles y compartidos por las dos opciones (flechas, perilla)

## 1.82.2 -- 2026-10-10

- Jog opcion 2: ajustes solo del diseno 1 en gris con el motivo; casilla para mostrar Mover sin limites abajo de STOP

## 1.82.1 -- 2026-10-10

- Pieza grande en el panel lateral

## 1.82.0 -- 2026-10-10

- Pieza grande: cortar un trabajo de laser por partes (seccion nueva en Laser/CNC)

## 1.81.0 -- 2026-10-10

- Mesa de trabajo: barra de trabajo v2 (Iman, Mover, Zona, Vista, Deshacer), Capas en columna fija, camara con dos modos, vista previa de Z y destino animado en vivo; clave de la camara

## 1.80.0 -- 2026-10-10

- Mesa de trabajo: una sola barra de trabajo debajo del mapa; la Camara funciona en todas las secciones con su panel en una tira bajo la barra y aviso ambar en En vivo

## 1.79.2 -- 2026-10-10

- SEGURIDAD jog diseno 2: al soltar una flecha el eje ya no sigue moviendose (un solo envio a la vez, stop inmediato y repetido, suelta al perder el foco o cambiar de pestana)

## 1.79.1 -- 2026-10-10

- Jog diseno 2: X, Y y Z en casillas separadas; la cruz y Z se ajustan al ancho del panel; velocidad e Ir a reacomodados

## 1.79.0 -- 2026-10-10

- Jog: Diseno 2 (engranaje > Apariencia > Diseno del jog): posicion, cruz de 8 direcciones mas Z (tocar = un paso, mantener = continuo con arranque suave), paso, velocidad, Ir a, guardadas, Home, Home Z, Ir a 0 y Sondear Z; el jog de siempre queda dentro de Mas. El diseno 1 no cambia

## 1.78.0 -- 2026-10-10

- En modo FFF las secciones de Laser / CNC se ocultan con un aviso y botones para cambiar de modo; el punto del laser solo en modo Laser; abre el Editor cuando Vision le manda una forma; el Editor recibe las formas de Vision

## 1.77.2 -- 2026-10-10

- Montada en: aviso claro si Vision no responde

## 1.77.1 -- 2026-10-10

- La barra roja de riesgo activo y los carteles de confirmacion se ven tambien en pantalla completa

## 1.77.0 -- 2026-10-10

- Pantalla completa con el panel de la seccion al lado (Hallar centro, Area de corte, Editor...), con un boton Panel para ocultarlo; los carteles de confirmacion se ven en pantalla completa

## 1.76.0 -- 2026-10-10

- Mesa de trabajo: Como se usa arriba del panel de cada seccion (pasos y notas; el Editor y Hallar centro con su propia guia)

## 1.75.0 -- 2026-10-10

- Panel de Zonas: una tarjeta a la vez con pestanas internas (Zona activa, Todas las zonas, Posiciones; Editar aparece mientras se edita)

## 1.74.0 -- 2026-10-10

- Arrastrar para editar en el mapa: el cabezal (al soltar, el menu del punto con Ir aca), el origen de una zona (abre su editor) y las esquinas del area de corte (tarjeta Guardar / Cancelar); nada se mueve ni se guarda solo. Barra lateral: cada grupo con su color (General azul, Laser / CNC naranja)

## 1.73.2 -- 2026-10-10

- Mantener apretado sobre una zona, posicion, retazo o prensa abre su tarjeta en cualquier seccion; Editar zona lleva a la seccion Zonas

## 1.73.1 -- 2026-10-10

- Capas: elegir donde va montada la camara (puente o carro), con doble toque y aviso de recalibrar

## 1.73.0 -- 2026-10-10

- Mapa: limpio por defecto (preset Limpio); capas Sonda (BLTouch) y Foto de la cama (Vision); punto del laser con la correccion de la maquina y aviso si no hay; Mover la camara pide doble toque; transparencia rapida de la camara; minimapa que se oculta; barra lateral con textos alineados. Hallar centro: Puntero o Laser al centro, crear circulo o rectangulo para cortar con giro, formas fijas en el centro medido

## 1.72.0 -- 2026-10-10

- Mesa de trabajo: las secciones van en una barra lateral a la izquierda del mapa, con los grupos General y Laser / CNC como titulos, y se pliega a iconos. Mapa: mantener apretado (o clic derecho) en cualquier punto y en cualquier seccion abre su menu (ir aca, punto Z, guardar posicion, marcar retazo, origen de zona aca, medir desde aca); el menu nunca queda cortado por el borde

## 1.71.0 -- 2026-10-10

- Editor laser: capas en filas compactas (potencia, mm/min y pasadas a la vista; aire, ver, bloquear, subir, Mover aqui y Mas); las capas bloqueadas no se tocan en el mapa; Ver orden de corte numera las formas y dibuja los traslados; la confirmacion de corte lista cada capa con potencia, W, mm/min, pasadas, aire y formas; enmarcar dice que su potencia es solo para enmarcar

## 1.70.1 -- 2026-10-10

- Grosor medido con dos decimales en la consola (zsurface.g); traducciones

## 1.70.0 -- 2026-10-10

- Mesa de trabajo: una sola pagina (una entrada en el menu) con pestanas en dos grupos, General (Zonas, Mesh, Trabajo en curso, Offsets) y Laser / CNC (Preparar, Editor, Hallar centro, Area de corte, Materiales), resaltado segun el modo; sin funciones repetidas. Reemplaza la pagina Trabajo 2D (el plugin TallerCorte ya no hace falta)

## 1.69.6 -- 2026-10-10

- URGENTE: la camara En vivo del mapa ya no repite el movimiento sola si un arrastre queda pegado (boton soltado fuera de la ventana)

## 1.69.5 -- 2026-10-10

- Traducciones y enganche de Vision con el area de corte

## 1.69.4 -- 2026-10-10

- Los comandos de la pagina van por HTTP desde el primero (antes salian por G-code mientras cargaban los plugins) y reintentan ~15 s si el servicio se esta reiniciando

## 1.69.3 -- 2026-10-10

- Camara en vivo en el mapa de Zonas, pantalla completa y Hallar centro; estilo comun (colores de pantalla, pestanas como v-tabs, Offsets en un solo lugar)

## 1.69.2 -- 2026-10-10

- Mapa: se puede alejar hasta x0.5 (una malla grande quedaba debajo de la regla); una sola correccion laser y un foco de lente para la maquina

## 1.69.1 -- 2026-10-10

- Registro de plugins: el modulo de advertencias ya no pisa window.__taller (ningun plugin JS arrancaba). Las calibraciones y ajustes guardados quedan anotados en Actividad

## 1.69.0 -- 2026-10-10

- Zonas de trabajo queda con lo general (zonas, Mesh, trabajo, offsets): lo de cortar paso a la pagina nueva Trabajo 2D (TallerCorte). Estandar de advertencias: lo que solo mueve pide doble toque ambar; lo que puede dañar (sondas, Z0, laser, malla, marcas) un toque y el cartel; soltar motores, cartel rojo con casilla y aviso de riesgo activo (barra roja y LEDs). Nombre visible del servicio: Servicio de la Pi

## 1.68.1 -- 2026-10-10

- Las paginas mandan sus comandos por HTTP al servicio de la Pi (sin la cola de la Duet); si el servicio no lo tiene, vuelven al G-code

## 1.68.0 -- 2026-10-10

- Hallar centro: la camara busca sola y pinta puntos candidatos; arrastrar la imagen mueve la maquina y la rueda o el pellizco sube o baja Z; Automatico dice que eligio. Jog: los toques rapidos de teclado y +/- ya no se pierden. Comandos M9003 en ingles; los nombres en español siguen como alias; traducciones al ingles completas

## 1.67.2 -- 2026-10-10

- Comunicacion: el aviso de falta el servicio de la Pi explica en el lugar como se comunica la Pi con la Duet (antes enlazaba a GitHub)

## 1.67.1 -- 2026-10-10

- Hallar centro: tomar los puntos moviendo la maquina, con la camara (tocar el punto en la imagen del mapa) o automatico

## 1.67.0 -- 2026-10-10

- Tema claro en el jog, el visor de camara y el mapa de Zonas con la camara de fondo; Hallar centro redisenado: primero que medir y despues como, con tarjetas con dibujo de donde tocar y el siguiente punto resaltado; Editor laser legible en tema claro, con pasos numerados y guia; Area de corte A mano: acerca el cabezal a cada esquina antes de soltar los motores y, tras medir la 1, lo lleva a la opuesta; Jog sin limites: linea fija que dice desde que velocidad detecta choques

## 1.66.2 -- 2026-10-10

- Jog: Aviso con enlace a la explicacion cuando falta el servicio de la Pi (sin modo SBC, sin el servicio o detenido)

## 1.66.1 -- 2026-10-10

- Zonas: el mapa sigue el tema claro de DWC

## 1.66.0 -- 2026-10-10

- Zonas > Trabajo dibuja el recorrido exacto del G-code de los trabajos de archivo (lo hecho fuerte, lo que falta tenue, avance del archivo); jog sin limites: aviso compacto (una linea + Detalles)

## 1.65.0 -- 2026-10-10

- Zonas de trabajo con tema claro (el mapa sigue oscuro); los trabajos en vivo (por red o USB) se nombran 'trabajo en vivo' en vez de un nombre de programa

## 1.64.1 -- 2026-10-10

- Linea de diseno comun en el panel (colores, letra minima 10 px); avisos de riesgo: cartel Continuar/Cancelar antes de mover la maquina sola, usar la sonda, encender el laser, bajar a Z0, soltar o probar motores o reiniciar la placa; Herramienta Camara: se ve lo que encuadra la camara y los botones de Z; Hallar centro con camara muestra el diametro

## 1.64.0 -- 2026-10-10

- Zonas: herramienta Camara (arrastrar la imagen o tocar mueve la camara, con confirmacion; Mas area/Mas detalle cambian Z); la camara puede ir en el carro (sigue a X); sin Vision se ocultan las funciones de camara

## 1.63.0 -- 2026-10-10

- Teclado: toque = un paso, sostener = continuo; Zonas: el mapa entra entero en la pantalla; Hallar centro con la camara; herramienta Camara en el mapa (arrastrar o tocar mueve el puente, con confirmacion)

## 1.62.2 -- 2026-10-10

- Zonas: fondo propio legible con el tema claro de DWC; camara del mapa visible sin home de Y/Z (con aviso); Editor laser: capas en tarjetas sin desbordar el panel; Mesh: region con dos toques (esquina y opuesta) y alejar el mapa entre medio

## 1.62.1 -- 2026-10-10

- El boton Activar del modo sin limites queda deshabilitado a la vista mientras se activa (y el del panel dice Esperando al backend)

## 1.62.0 -- 2026-10-10

- Ejes extra (U, V, W, A...) en la pestana Paso con tocar / mantener +/-, tambien en el modo sin limites, y se eligen en Ajustes; aviso visible si se intenta mover un eje sin homing; Zonas > Trabajo: historial de trabajos (ver uno en el mapa, borrar uno o todo, volver al actual)

## 1.61.6 -- 2026-10-10

- El jog avisa los ejes sin homing (no se mueven fuera del modo sin limites); sensibilidad de choque por defecto menos sensible

## 1.61.5 -- 2026-10-10

- framecutarea.g: solo un comentario (sin referencias internas)

## 1.61.4 -- 2026-10-10

- Zonas: el aviso de la camara apagada apunta al interruptor nuevo de Vision (En Zonas de trabajo / Ajustes > Mapa de Zonas de trabajo)

## 1.61.3 -- 2026-10-10

- Los avisos de DWC (errores, M291) ya no quedan detras de los paneles ni del mapa de Zonas; minimizar el jog es instantaneo

## 1.61.2 -- 2026-10-10

- Mover sin limites: dos modos (Sin homing / Fuera de limites con homing), color del parpadeo configurable, solo acepta movimientos del jog, la consola y el panel de DWC

## 1.61.1 -- 2026-10-10

- Trabajo: se actualiza solo cuando empieza otro trabajo; Quitar del mapa y Borrar el ultimo trabajo

## 1.61.0 -- 2026-10-10

- Mover sin limites: jog sin homing o unos mm fuera de los limites, con advertencias, panel parpadeando rojo/naranja, guardas (margen, velocidad y corriente reducidas, choque por driver, se apaga solo) y respaldo en la placa; los ajustes del jog ya no borran otras claves de taller-jog.json

## 1.60.3 -- 2026-10-10

- Boton Camara en la barra del mapa para mostrar/ocultar la camara (configurada en Vision); arregla Zonas que no cargaba

## 1.60.2 -- 2026-10-10

- Tira de LEDs: el texto dice si muestra los LEDs de estado o toda la tira (cuando la iluminacion tiene el control)

## 1.60.1 -- 2026-10-10

- Comun: traducciones nuevas al ingles y tira de LEDs completa solo con la iluminacion al mando

## 1.60.0 -- 2026-10-10

- Camara del mapa: ya no tiene configuracion propia; usa la camara y la calibracion de Vision (sigue al puente en Y/Z). En el mapa queda solo la capa Camara, con aviso de por que no se ve

## 1.59.2 -- 2026-10-10

- Posiciones guardadas sin desborde en la Pi ni en Chrome (tabla compacta en Zonas; nombre recortado en el jog)

## 1.59.1 -- 2026-10-09

- Une la 1.59.0 (capa Vision, origen desde la camara) con los LEDs de estado de la 1.58.7 (visibles con el automatico apagado); la 1.58.7 habia pisado la 1.59.0 en la Pi

## 1.59.0 -- 2026-10-09

- Zonas: capa Vision en el mapa (detecciones de TallerVision) y Origen de zona desde la camara

## 1.58.6 -- 2026-10-09

- LEDs de estado: helper compartido con el mismo dibujo y color de tira en toda la interfaz

## 1.58.5 -- 2026-10-09

- Reconstruido con el helper compartido de LEDs actualizado (LEDs con poco brillo se ven)

## 1.58.4 -- 2026-10-09

- Modo foco: si el corte se sale de la vista acercada, el mapa se reacomoda solo

## 1.58.3 -- 2026-10-09

- Modo foco: trabajo en vivo con tiempo, acercar al trabajo solo y con boton

## 1.58.2 -- 2026-10-09

- Iman en las posiciones guardadas

## 1.58.1 -- 2026-10-09

- Botones del mapa en bloques: zoom +/- en uno, ajustar/seguir, girar/normal, herramientas

## 1.58.0 -- 2026-10-09

- Barras de herramientas con iconos a los costados del mapa; Vista normal con el mapa girado; Editor laser: recuadro de seleccion y Borrar N formas; ledEstado borde (e88b29b)

## 1.57.5 -- 2026-10-09

- Barra del Mesh al costado; mas margen alrededor del mapa en zoom x1

## 1.57.4 -- 2026-10-09

- Prensas apagadas por defecto (Capas > Usar prensas); linea de LEDs de estado en el encabezado del jog

## 1.57.3 -- 2026-10-09

- Celular/kiosco angosto: barra del mapa en una linea, sin barra de estado

## 1.57.2 -- 2026-10-09

- Flechas del 0,0 y referencias no tapan el toque de los marcadores

## 1.57.1 -- 2026-10-09

- Zonas: marcadores de zonas cercanas agrupados (tocar = elegir), arreglos de tarjetas al cambiar de pestana

## 1.57.0 -- 2026-10-09

- Zonas de trabajo con el mapa al centro: mapa fijo y panel al costado/debajo, modo foco con trabajo en curso, zonas encimadas, giro/espejo/temas/fondo, prensas, retazos y ubicar formas del Editor laser con iman

## 1.56.4 -- 2026-10-09

- Ctrl+rueda / Ctrl+tecla pasan al zoom de Chrome

## 1.56.3 -- 2026-10-09

- Macros con lineas cortas (lasermark, zcal-mark, zcal-probe)

## 1.56.2 -- 2026-10-09

- Offsets: usar la correccion ya configurada en las zonas o escribirla, con aviso

## 1.56.1 -- 2026-10-09

- Offsets: los campos ya no pierden el foco al escribir

## 1.56.0 -- 2026-10-09

- Area de corte redisenada: fichas por modo, Probar agrupado y metodos de medicion explicados

## 1.55.0 -- 2026-10-09

- Pestana Offsets (laser-puntero, sonda movida desde Mesh, altura Z); avisos claros al medir el area de corte a mano

## 1.54.1 -- 2026-10-09

- Calibrar: se redibuja con el refresco de estado

## 1.54.0 -- 2026-10-09

- Pestana Calibrar: laser<->puntero de la maquina (asistente con marca) aplicable a las zonas; atajos al offset de la sonda y a la altura Z

## 1.53.0 -- 2026-10-09

- Calibrar la altura: configuracion general por modo y cada zona elige usar la general o una propia

## 1.52.0 -- 2026-10-09

- Calibrar la altura por zona y por modo: BLTouch (altura de disparo y ajuste fino), papel a mano y SZP (FFF)

## 1.51.0 -- 2026-10-09

- Mesh: cantidad de puntos por TOTAL (se reparten entre X e Y con separacion pareja), ademas de automatico y por eje; atajos 9/16/25/36/49/64/100

## 1.50.3 -- 2026-10-09

- Traducciones de metricas de Servicios

## 1.50.2 -- 2026-10-09

- Traducciones sueltas

## 1.50.1 -- 2026-10-09

- Traducciones nuevas (Motores, Luces, Servicios)

## 1.50.0 -- 2026-10-09

- Aviso de la sonda explicado con arreglo de un toque; Preparar: Ver en el mapa

## 1.49.2 -- 2026-10-09

- Ingles: reglas de tiempo relativo, pagina Luces, rotulos del mapa

## 1.49.1 -- 2026-10-09

- Ingles para el historial de Actividad

## 1.49.0 -- 2026-10-09

- Mensajes de las macros en el idioma de DWC (ingles/espanol)

## 1.48.2 -- 2026-10-09

- Ingles para todas las paginas del taller

## 1.48.1 -- 2026-10-09

- Sin depender de global.selectedMode (modo de RRF como respaldo)

## 1.48.0 -- 2026-10-09

- Editor de zonas: Material y enfoque con lista de macros y vista previa

## 1.47.0 -- 2026-10-09

- Macros movidas a sys/taller/ para no pisar archivos de otras maquinas

## 1.46.1 -- 2026-10-09

- Textos nuevos traducidos al ingles

## 1.46.0 -- 2026-10-09

- Mapa de Zonas reorganizado: herramientas, capas, zonas con estado, pantalla completa, minimapa

## 1.45.0 -- 2026-10-09

- Trabajo: impresion por capas, CNC por profundidad (antes solo laser)

## 1.44.0 -- 2026-10-09

- Zonas: chequeo de zonas, grosor del material, biblioteca de materiales, asistente Preparar, camara del mapa calibrada (URL propia)

## 1.43.1 -- 2026-10-09

- Posicion y velocidad arriba, junto a la perilla (opcion abajo en el engrane)

## 1.43.0 -- 2026-10-09

- Jog: engrane de ajustes (que se ve, velocidad y respuesta, pasos, apariencia)

## 1.42.0 -- 2026-10-09

- Zonas: punto de medicion de Z por zona (ver/ajustar en mapa, referencias, posiciones o coordenada) y Medir Z0 en Laser/CNC/FFF

## 1.41.2 -- 2026-10-09

- Asistente de offset de la sonda rediseñado: progreso, secciones numeradas e indicadores

## 1.41.1 -- 2026-10-09

- Offset de la sonda rediseñado: offset X/Y en indicadores, procedimiento en 3 pasos, boton grande

## 1.41.0 -- 2026-10-09

- Mesh: parte de abajo rediseñada (indicadores, dos columnas, pasos numerados, puntos con -/+); ocultar teclado solo en el kiosko

## 1.40.0 -- 2026-10-09

- Botones de macro: se ven ACTIVOS (borde, brillo, punto verde) cuando su funcion esta encendida, igual que en la barra

## 1.39.1 -- 2026-10-09

- Botones copiados de la barra: se reconocen aunque ya tengan color guardado

## 1.39.0 -- 2026-10-09

- Botones de macro copiados de la barra funcionan con la maquina apagada (mismas reglas que la barra); Mesh menos apretado: barra arriba del mapa, pasos con mas espacio

## 1.38.1 -- 2026-10-09

- Botones de macro del jog con el mismo aspecto que en la barra (color, tamano, confirmacion)

## 1.38.0 -- 2026-10-09

- Mesh: region editable en el mapa (esquinas, bordes, mover) y barra flotante con las acciones de los pasos

## 1.37.3 -- 2026-10-09

- Zonas: mapa a todo el ancho; Zona activa y editor lado a lado debajo

## 1.37.2 -- 2026-10-09

- Jog: las posiciones guardadas ya no se borran desde el jog, solo desde Zonas

## 1.37.1 -- 2026-10-09

- Zonas: Zona activa debajo del mapa, editor a la derecha sin hueco

## 1.37.0 -- 2026-10-09

- Zonas: tarjeta Zona activa reorganizada en secciones al lado del mapa

## 1.36.2 -- 2026-10-09

- Zonas: tocar una referencia o cualquier punto del mapa para ir ahi o guardarlo como posicion

## 1.36.1 -- 2026-10-09

- Zonas: tocar un rombo del mapa para ir a esa posicion

## 1.36.0 -- 2026-10-09

- Posiciones guardadas tambien en Zonas; jog y Zonas no se pisan la lista

## 1.35.1 -- 2026-10-09

- Traduccion: pagina Salud de la Pi

## 1.35.0 -- 2026-10-09

- Editor laser: interfaz ordenada en secciones; las formas no salen del area de corte

## 1.34.0 -- 2026-10-09

- Cortes simples: importar SVG (cada color de trazo a una capa)

## 1.33.0 -- 2026-10-09

- Cortes simples: capas por color (potencia/velocidad/pasadas/aire, orden), polilinea, esquinas redondeadas

## 1.32.0 -- 2026-10-09

- Cortes simples: editor (manijas escalar/girar, seleccion multiple, duplicar, arreglos, alinear, espejo, deshacer)

## 1.31.2 -- 2026-10-09

- Pagina Zonas: lee el estado cada 3 s con la maquina quieta (1 s moviendose): menos carga en la Pi

## 1.31.1 -- 2026-10-09

- Menos lecturas de estado a DSF (titubeo del jog con la Pi cargada)

## 1.31.0 -- 2026-10-09

- Hallar centro: 2 puntos + diametro, 2 esquinas opuestas, por bordes, medida conocida + 1 esquina, punto medio; guardar como posicion y copiar G-code. Zonas > Trabajo: recorrido en vivo y reporte

## 1.30.1 -- 2026-10-09

- Jog: con trabajo en vivo abierto se desbloquea solo tras 5 s quieta (ya no parpadea entre lineas)

## 1.30.0 -- 2026-10-08

- El jog y los botones de movimiento se bloquean durante un trabajo en vivo (no solo con trabajos de archivo)

## 1.29.1 -- 2026-10-08

- Medir y enfocar ~2 s mas rapido (recarga solo los origenes de las zonas)

## 1.29.0 -- 2026-10-08

- Zona activa: altura de foco editable que se guarda en la macro de material (Guardar en mdf3mm.g / Crear macro)

## 1.28.4 -- 2026-10-08

- Offset laser 4 veces mas rapido: laseroffset.g reaplica solo los origenes de las zonas (wpload.g)

## 1.28.3 -- 2026-10-08

- Traduccion: tarjeta Zona activa, mesh y textos del backend

## 1.28.2 -- 2026-10-08

- Traduccion: paginas Vue (deteccion de ruta) y version compartida del traductor

## 1.28.1 -- 2026-10-08

- Zona activa: G54 aparece en Activar

## 1.28.0 -- 2026-10-08

- Zonas: tarjeta Zona activa con todo lo del jog (offset laser, ir a cero laser/puntero/ejes, medir y enfocar, enfocar aqui, zero/sondar Z, fijar origen) mostrando a donde va cada cosa

## 1.27.4 -- 2026-10-08

- Traduccion: textos de las paginas Vue con saltos de linea

## 1.27.3 -- 2026-10-08

- Traduccion: paginas Consumo/Motores/Actividad/Servicios y menu lateral

## 1.27.2 -- 2026-10-08

- Traduccion: textos armados por partes se traducen completos

## 1.27.1 -- 2026-10-08

- Mesh: 'Recortada' solo cuando de verdad se recorta (no por el redondeo)

## 1.27.0 -- 2026-10-08

- Mesh: zona medible = alcance de la sonda dentro del area de corte; iman sobre puntos de la malla; tiempo estimado segun la cantidad de puntos (y calibrado con la ultima malla real) con progreso mientras mide; capa de traduccion al ingles (sesion system32-2e)

## 1.26.2 -- 2026-10-08

- Botones de macro: la X ya no aparece; Editar para ordenar y borrar (doble toque)

## 1.26.1 -- 2026-10-08

- Arreglo: mantener + / - en tactil quedaba pegado (boton naranja, seguia moviendo hasta el limite y peleaba con la perilla: ir y venir)

## 1.26.0 -- 2026-10-08

- Enfocar guarda el pin del BLTouch antes de moverse (M280 S160 + M402); aviso 'pin AFUERA' + Guardar pin en los pasos; Jog: Botones de macro eligen origen (boton de la barra, macro o G-code)

## 1.25.0 -- 2026-10-08

- Botones de macro: elegir origen (boton existente de la barra, macro de la lista o G-code). Enfocar guarda el pin del BLTouch antes de moverse; aviso 'pin AFUERA' + Guardar pin

## 1.24.1 -- 2026-10-08

- Nombre visible sin & (el install fallaba con Illegal plugin name); incluye referencias de centro de zona

## 1.24.0 -- 2026-10-08

- References: centro de cada zona de trabajo (con la medida del material, nuevo campo opcional ancho x alto en el editor de zonas) y su contorno en el mapa; Mesh Desde zona usa esa medida

## 1.23.1 -- 2026-10-08

- Nombre visible en ingles

## 1.23.0 -- 2026-10-08

- Paso: mantener presionado + o - mueve continuo hasta soltar (toque corto = un paso)

## 1.22.0 -- 2026-10-08

- Mapa: capa References (centro de la cama, X0 Y0, centro, esquinas y mitades del area de corte) con su boton de ojo; un toque cerca de una referencia se pega a ese punto

## 1.21.1 -- 2026-10-08

- Offset de la sonda: el resultado dice boquilla/fresa/puntero segun el modo

## 1.21.0 -- 2026-10-08

- Offset de la sonda tambien en FFF y CNC: punto hecho a mano, punta (boquilla/fresa) encima, sale el pin, OK; guarda en modefff.g / modecnc.g (sin laser, potencia ni enfoque)

## 1.20.4 -- 2026-10-08

- Offset de la sonda: elegir en el mapa el punto de la cruz, Ir ahi (haz sobre el punto) y quemar solo cuando el haz esta ahi

## 1.20.3 -- 2026-10-08

- Posicion y velocidad visible en todas las pestañas (Home, Paso, Avanzado)

## 1.20.2 -- 2026-10-08

- Offset de la sonda: Volver a la cruz y Usar la cruz ya marcada; los trabajos de ayuda ya no estacionan al terminar (stop.g/cancel.g)

## 1.20.1 -- 2026-10-08

- Botones A-/A+ para cambiar el tamano del jog (por pantalla)

## 1.20.0 -- 2026-10-08

- Pasos con requisitos y boton para resolverlos: Hacer homing, aviso de modo/ocupada, Enfocar aqui con altura H (atajos de las macros de material) en offset de sonda, Mesh y Cortar

## 1.19.0 -- 2026-10-08

- Botones de laser desactivados fuera del modo Laser, con el motivo en el cartel

## 1.18.0 -- 2026-10-08

- Asistente Medir offset de la sonda (cruz con el laser -> pin afuera -> acomodar con jog -> OK captura -> guardar G31 en modelaser.g); laserfocus.g ahora mide con la sonda sobre X30 Y30 del material

## 1.17.0 -- 2026-10-08

- Pestanas tipo ventana en Zonas: Zonas / Cortes simples / Hallar centro / Mesh (Hallar centro ahora tiene su propia pestana)

## 1.16.0 -- 2026-10-08

- Mesh reorganizado en pasos: 1 Region (con Cambiar y Quitar region visibles), 2 Puntos, 3 Medir, Mallas guardadas

## 1.15.0 -- 2026-10-08

- Doble toque estable: el boton no cambia de tamano ni se pierde al refrescar la tabla; jog: botones X0 Y0 laser / X0 Y0 puntero

## 1.14.2 -- 2026-10-08

- Campos de texto del layout Mesh visibles (estilo tz-input)

## 1.14.1 -- 2026-10-08

- meshzone.g: M557 con arrays (la forma X{a}:{b} da error en RRF, probado)

## 1.14.0 -- 2026-10-08

- Layout Mesh en Zonas: mesh solo en una region (dibujada, area de corte, trabajo de Cortes, zona + medida, toda la cama), recortada a lo que alcanza la sonda, malla por colores en el mapa, mallas guardadas (sys/mesh-*.csv) con Ver/Cargar/Borrar

## 1.13.0 -- 2026-10-08

- Lineas con ajuste de angulo 45/15/libre + largo/angulo/direcciones; Hallar centro: destino en el mapa -> Ir ahi -> jog -> capturar; area de corte desde posiciones guardadas, selector de posicion guardada en el editor de zonas, capa Posiciones en el mapa

## 1.12.0 -- 2026-10-08

- Posiciones guardadas en Zonas: como esquinas del area de corte, como punto de una zona y como capa en el mapa; lineas con ajuste de angulo y Hallar centro con destino en el mapa (sesion system32-69)

## 1.11.0 -- 2026-10-08

- Carteles (hover / mantener apretado) en todos los botones, modo ayuda ? en el jog, etiquetas mas cortas; Ir a X0 Y0 dice donde quedan puntero y laser; workzero.g avisa al llegar

## 1.10.1 -- 2026-10-08

- Posiciones guardadas: el campo de nombre muestra solo el nombre por defecto

## 1.10.0 -- 2026-10-08

- Cortes simples: dibujar arrastrando, mover formas arrastrandolas, Hallar centro en su propia tarjeta

## 1.9.0 -- 2026-10-08

- Posiciones guardadas: se guardan en la Pi (todas las pantallas ven las mismas), nombre por defecto, 'Ir' sube Z primero (no cruza rozando el material) y explicacion de para que sirven

## 1.8.0 -- 2026-10-08

- Cortes simples + hallar centros, dibujar el area de corte con pruebas, info del cabezal, regla con margen, W del laser configurable

## 1.7.1 -- 2026-10-08

- Guardian del laser: potencia en S (no en P)

## 1.7.0 -- 2026-10-08

- Enmarcar el area de corte con el laser a baja potencia (4% por defecto, aviso >3%, tope 10%, guardian sys/laserguard.g)

## 1.6.1 -- 2026-10-08

- Mapa de Zonas: regla pegada al borde visible del recuadro (tambien con mucho zoom)

## 1.6.0 -- 2026-10-08

- Incluye sus 11 macros (sys/workzero, workzeroaxis, saveworkplace, workplaces, laseroffset, laserfocus, framecutarea, gotobed, handfree, handcorner, macros/probe/homezhere) para instalarse en otra maquina; build protege contra pisar macros editadas en la SD

## 1.5.1 -- 2026-10-08

- Mapa de Zonas: un solo tooltip (coordenada, areas y zona cercana), ya no se superponen

## 1.5.0 -- 2026-10-08

- Mapa de Zonas: regla en mm (bordes de la vista + grilla), se adapta al zoom

## 1.4.0 -- 2026-10-08

- Mapa de Zonas: capas con ojo, areas por modo con color y coordenadas, tooltip de coordenadas, zoom/paneo, medir desde el mapa

## 1.3.0 -- 2026-10-08

- Boton Enmarcar el area de corte (contorno con el puntero, laser apagado) en la pagina Zonas y el panel jog

## 1.2.0 -- 2026-10-08

- Pagina Zonas: medir/editar el area de corte (puntero, laser o a mano) con vista previa en el mapa; logica compartida con el panel jog

## 1.1.3 -- 2026-10-08

- Pagina Zonas: fecha local en los comentarios

## 1.1.2 -- 2026-10-08

- Pagina Zonas: guarda con 4 decimales (re-guardar una zona no la corre)

## 1.1.1 -- 2026-10-08

- Pagina Zonas: mapa mas compacto, zonas en el mismo punto agrupadas; editar el foco conserva el nombre de la macro

## 1.1.0 -- 2026-10-08

- Pagina Complementos > Zonas de trabajo (mapa, tabla, editor con macro de foco, historial, exportar/import); boton flotante propio sin barra; S0 en Ir/Paso (sesion system32-69)

