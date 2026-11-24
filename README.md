# NexDeck

Controle o OBS Studio pelo celular na mesma rede do PC. Troque de cena, silencie fontes de áudio, inicie e pare gravações ou transmissões e salve replays. O painel tem temas, cores e botões personalizáveis.

[Baixar o NexDeck para Windows](https://github.com/AndyMarksss/nexdeck/archive/refs/heads/main.zip)

## Comece aqui

| Quero… | Caminho |
| --- | --- |
| Controlar o OBS pelo navegador do celular | Siga o [primeiro uso](#primeiro-uso-no-windows). Esse modo funciona por HTTP na rede local. |
| Abrir o NexDeck pelo ícone do Android, em janela própria | Depois do primeiro teste, configure o [PWA com DuckDNS](#instalar-o-pwa-no-android). |

### O que você precisa

- Um PC com Windows, [Node.js LTS](https://nodejs.org/en/download) versão 22 ou superior e [OBS Studio](https://obsproject.com/download) versão 28 ou superior.
- Um celular na mesma rede local do PC. O computador pode usar cabo e o celular, Wi-Fi, desde que estejam na mesma rede.
- Acesso à internet no PC para baixar as dependências na primeira execução. No modo PWA, a emissão e a renovação do certificado também usam a internet.

## Primeiro uso no Windows

### 1. Prepare o OBS

1. Abra o OBS Studio e vá a **Ferramentas → Configurações do servidor WebSocket**.
2. Ative o servidor WebSocket e mantenha a autenticação ativada. Use a porta padrão **4455**.
3. Copie a senha que aparece nas informações de conexão. [Guia oficial do OBS](https://obsproject.com/kb/remote-control-guide)

### 2. Abra o NexDeck

1. Baixe o ZIP e extraia a pasta inteira.
2. Dê dois cliques em **NexDeck.cmd**. Na primeira execução, aguarde o download das dependências. Se o Windows solicitar acesso de rede para o Node.js, permita na rede **Privada**.
3. O navegador deve abrir o [painel do computador](http://127.0.0.1:3000/). Clique em **Inserir senha do OBS**, cole a senha e confirme.
4. Quando aparecer **OBS conectado**, procure **Parear o celular**. Deixe o OBS e a janela do NexDeck abertos durante o uso.

### 3. Conecte o celular

1. Em **Endereço nesta rede**, escolha o IP da rede que o PC compartilha com o celular. Se houver várias opções, abra o PowerShell no PC, execute `ipconfig` e confira o **Endereço IPv4** do adaptador Wi-Fi ou Ethernet em uso.
2. No celular, aponte a câmera para o QR e abra o link. A interface deve mostrar a cena ativa e o estado do OBS.
3. Para conferir a conexão, faça um teste na aba **Cenas**. O NexDeck destaca a cena ativa.

Se o NexDeck já estiver aberto no celular, toque em **Parear nesta tela**. Em HTTP, use **Tirar foto do QR** ou cole o link copiado no PC. Em HTTPS, use **Ler QR pela câmera**. O pareamento ocorre na própria tela. O endereço do QR deve coincidir com o endereço aberto, incluindo o protocolo e a porta.

## Instalar o PWA no Android

O PWA abre pelo ícone da tela inicial, em uma janela própria. Com **DuckDNS e Let’s Encrypt**, o Chrome reconhece o HTTPS sem instalar uma autoridade certificadora no Android. O DuckDNS fornece um nome para o IP privado do PC, e a validação DNS-01 permite emitir o certificado sem abrir portas no roteador. O NexDeck e o OBS rodam no seu PC. [DuckDNS](https://www.duckdns.org/spec.jsp) · [Let’s Encrypt](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)

### 1. Prepare o nome e o certificado no PC

1. Entre no [DuckDNS](https://www.duckdns.org/), escolha um subdomínio e clique em **add domain**. Tenha à mão o nome completo e o token.
2. Baixe o [lego v5.7.0 para Windows](https://github.com/go-acme/lego/releases/tag/v5.7.0) e extraia o `lego.exe`. Na lista de arquivos, use `windows_amd64.zip` para Windows de 64 bits em Intel ou AMD, ou `windows_arm64.zip` para Windows ARM64.
3. Na pasta do NexDeck, abra o PowerShell. No exemplo abaixo, substitua o subdomínio, o IPv4 local do PC e o caminho para o `lego.exe`.

```powershell
$nome = 'meunexdeck.duckdns.org'
$ipLocal = '192.168.1.50'
$lego = 'C:\Ferramentas\lego.exe'

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\prepare-duckdns.ps1 -Domain $nome -LocalAddress $ipLocal -LegoPath $lego
```

4. Informe o e-mail solicitado, aceite os termos do Let’s Encrypt se estiver de acordo e cole o token do DuckDNS na entrada mascarada. Aguarde a mensagem **Certificado pronto**.
5. Feche a instância anterior do NexDeck, caso esteja aberta, e execute **NexDeck.cmd** de novo. O comando carrega o perfil salvo neste PC. Abra o [painel do computador](http://127.0.0.1:3000/) e conecte o OBS se for solicitado. O novo QR aparece em **Parear o celular**.

### 2. Instale e pareie no Android

1. No mesmo Wi-Fi, abra no Chrome o endereço HTTPS mostrado no painel do PC, por exemplo `https://meunexdeck.duckdns.org:3443`. Use o seu próprio subdomínio.
2. No menu do Chrome, escolha **Instalar e criar atalho → Instalar**. O nome do menu pode variar conforme a versão.
3. Abra o NexDeck pelo ícone da tela inicial. Em **Parear nesta tela → Ler QR pela câmera**, autorize a câmera e aponte para o QR do PC.

### 3. Use depois de reiniciar

- No PC, abra o **OBS** e o **NexDeck.cmd**. Se o painel pedir a senha do WebSocket, informe-a no computador.
- No Android, abra o ícone já instalado. O NexDeck gera um novo código a cada reinício do seu servidor. Se o app pedir pareamento, escaneie o QR atualizado dentro dele.
- Se o IP local mudar, execute o script com o novo IPv4. Mantendo o subdomínio, o endereço do PWA continua o mesmo.
- A renovação é manual. Antes de o certificado vencer, execute o mesmo comando com os seus dados. Depois que o certificado for renovado, reinicie o NexDeck para carregá-lo.

O perfil e as chaves ficam em `%LOCALAPPDATA%\NexDeck`. Mantenha o token do DuckDNS, a senha do OBS, a chave privada e o QR de pareamento fora de capturas públicas e do GitHub.

## Controles e personalização

- **Ações** controla gravação, transmissão e replay. Para habilitar **Salvar replay**, ative e inicie o buffer de replay no OBS.
- **Cenas** mostra a cena ativa e permite alternar entre as cenas da coleção atual.
- **Áudio** silencia ou reativa as fontes de áudio exibidas.
- **Configurações** ajusta o tema, a cor de destaque e o tamanho dos botões. O ícone de lápis nas abas permite reordenar e ocultar controles.

As preferências são salvas por endereço no navegador. Ao migrar do painel HTTP para o PWA HTTPS, ajuste a aparência no novo endereço.

## Se algo falhar

| Sintoma | O que verificar |
| --- | --- |
| O painel do PC não abre | Confirme se o Node.js está instalado e se a janela do `NexDeck.cmd` continua aberta. Acesse [127.0.0.1:3000](http://127.0.0.1:3000/). |
| O NexDeck não se conecta ao OBS | Deixe o OBS aberto. Confira a senha, a opção **Ativar servidor WebSocket** e a porta **4455**. |
| O QR não aparece | Conecte o OBS no painel e confira se o PC tem um IPv4 privado ativo na rede do celular. |
| O celular não alcança o painel | Confira o IP selecionado, a rede e o firewall do PC. Redes de convidados podem isolar os aparelhos entre si. |
| O endereço DuckDNS deixou de abrir | No PC, execute `Resolve-DnsName seu-nome.duckdns.org -Type A` no PowerShell e compare o resultado com o IPv4 local. Se mudou, rode o preparo com o novo IP. Se o PC resolve corretamente e o celular não, verifique se o DNS da rede permite resolver esse nome para um endereço privado. |
| O Chrome mostra um aviso de certificado ou só oferece um atalho | Abra o endereço HTTPS com o subdomínio e a porta `3443`. Confira a validade do certificado e veja se o aviso desapareceu antes de tentar **Instalar** novamente. |
| O pareamento expirou ou o app está desconectado | Atualize a página do PC, deixe o OBS conectado e escaneie o QR novo em **Parear nesta tela**. |

## Opções avançadas e desenvolvimento

- `.\NexDeck.cmd --lan` inicia o modo HTTP local, mesmo quando há um perfil DuckDNS salvo.
- Para um PWA com CA local, execute `npm.cmd run pwa:prepare -- 192.168.1.50` com o IPv4 real e inicie `.\NexDeck.cmd --pwa=192.168.1.50`. Esse modo usa o OpenSSL, disponível no Git para Windows quando instalado no caminho padrão. Baixe a CA pelo painel do PC e importe-a como **Certificado CA** no Android para usar o endereço HTTPS por IP.
- As portas padrão são `3000` para o painel do PC, `3443` para o PWA e `4455` para o WebSocket do OBS. Para mudá-las, use `NEXDECK_PORT`, `NEXDECK_PWA_PORT` e `NEXDECK_OBS_PORT`, respectivamente.
- Para desenvolvimento, execute `npm.cmd run setup` para instalar as dependências e `npm.cmd run check` para verificar a sintaxe. O servidor e a interface usam JavaScript sem etapa de compilação. Os ícones são do [Font Awesome Free](https://fontawesome.com/license/free).
