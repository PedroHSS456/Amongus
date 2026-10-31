# Traidor Orbital

Jogo de dedução social 2D para celular e PC (navegador), **original** (personagens, mapa "Estação Órbita", nomes e arte próprios), com salas online, bots, minijogos, sabotagens, reuniões com votação e chat de voz por proximidade.

## Como rodar
```bash
npm install
npm start          # http://localhost:8080  (cliente + servidor WebSocket na mesma porta)
npm test           # 30 testes do núcleo + 36 testes do servidor
```
Modo **LOCAL** (contra bots) funciona abrindo `web/index.html` por qualquer servidor estático; o **ONLINE** precisa do servidor Node.

## Deploy (Render)
O arquivo `render.yaml` já define um *Web Service* Node (build `npm install`, start `npm start`, health check `/healthz`). O cliente usa a mesma origem do servidor (`web/js/config.js`, `AU_SERVER=''`). O microfone exige HTTPS (o Render já fornece).

## Controles
- **Celular:** toque e arraste na metade esquerda da tela (joystick invisível); botões da direita (USAR, DENUNCIAR, MATAR, SABOTAR, DUTO, DISFARCE) e do topo (microfone, chat, configurações, mapa) são só ícones, sem fundo nem borda, e funcionam ao mesmo tempo que o joystick.
- **PC:** WASD/setas, `E`/Espaço usar, `Q` matar, `R` denunciar, `G` sabotar, `C` duto, `Z` disfarce, `M` mapa, `V` falar (modo pressionar-para-falar), `Esc` pausa.
- Microfone (botão com a imagem do microfone): desligado, ligado, falando (anel verde) e sem permissão (vermelho).

## Arquitetura
- `web/shared/` — módulos isomórficos: `map.js` (mapa 64×38, colisão, portas, linha de visão, caminhos), `sim.js` (simulação **autoritativa**), `bots.js` (IA).
- `server/server.js` — HTTP estático + WebSocket + API `/api/rooms`. Roda a `Sim` a 20 Hz e envia a cada jogador apenas a sua `view` filtrada (quem é impostor, tarefas dos outros etc. nunca saem do servidor). Entradas são validadas pela simulação (velocidade normalizada, tarefas com tempo mínimo/proximidade/resposta, cooldowns, alcance de matar/denunciar).
- `web/js/` — cliente: `draw.js` (render Canvas 2D, neblina por linha de visão), `mini.js` (minijogos), `app.js`/`app2.js` (menus, lobby, HUD, reunião, entrada), `voice.js` (voz).
- Voz: o cliente envia PCM 16 kHz por WebSocket; o **servidor** calcula distância (alcance configurável), parede (som abafado e mais baixo), fantasmas, duto e reunião, e só repassa a quem pode ouvir. O cliente aplica volume, filtro de abafamento, reverberação por tamanho do ambiente e volume/mudo por jogador.

## Estado verificado
Verificado por testes automáticos (`npm test`) e por navegador headless (Playwright): limite de 25 participantes (humanos+bots), bots com campo de visão/memória, partidas completas com mortes/reuniões/votos/vitórias, reconexão, criação/entrada por código, sala pública/privada, anti-trapaça básico, minijogos (fios, sequência, código, alinhar, alavancas, reator, câmeras), sabotagens e consertos, reunião com chat e votação, relé de voz por proximidade com dois clientes reais.

**Ainda não verificado / não implementado:** teste em aparelhos Android reais (só emulação de tela no Chromium); qualidade subjetiva da reverberação/abafamento da voz; funções especiais além de impostor/tripulante (engenheiro, cientista etc.); tarefas de distração; salas persistentes entre reinícios do servidor.
