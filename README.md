# NexDeck

Painel local e personalizável para controlar o OBS Studio pelo navegador. Troque cenas, controle fontes de áudio, grave, transmita e salve replays. O botão de replay fica disponível quando o buffer do OBS estiver ativo.

## Instalação no Windows

1. No PC que vai rodar o OBS, instale o [Node.js LTS](https://nodejs.org/) (22 ou mais recente) e o [OBS Studio](https://obsproject.com/).
2. No GitHub, use **Code → Download ZIP** e extraia a pasta inteira. Se você usa Git, pode clonar o repositório.
3. Dê dois cliques em **NexDeck.cmd**. Na primeira execução ele baixa as dependências e abre o painel no navegador. Mantenha a janela do NexDeck aberta.
4. No OBS desse PC, abra **Ferramentas → Configurações do servidor WebSocket**. Ative o servidor na porta 4455, mantenha a autenticação ligada e copie a senha.
5. No NexDeck, clique em **Inserir senha do OBS**. Em **Parear o celular**, escaneie o QR com o telefone conectado à mesma rede.

Se o Windows pedir permissão para o Node.js receber conexões, permita na rede **Privada** de casa. As cenas e fontes exibidas vêm do OBS que você conectou. Em outro computador, use a senha do OBS daquele computador e gere um novo QR.

Na rede local, você pode usar o painel pelo navegador do celular e criar um atalho para ele. A instalação do PWA em janela própria no Android usa o modo HTTPS opcional descrito abaixo.

O guia usa o WebSocket 5, integrado ao OBS Studio a partir da versão 28. O painel mostra as versões informadas pelo OBS depois da conexão.

## Personalizar e instalar

No celular, use as abas **Ações**, **Cenas** e **Áudio** na barra inferior em retrato ou na lateral em paisagem. A grade usa o espaço disponível e divide listas maiores em páginas. Em **Configurações**, escolha o tema, a cor de destaque e o tamanho dos botões. Use o lápis em cada aba para editar a ordem e a visibilidade dos controles. O layout é salvo no navegador do celular. O tutorial pode ser reaberto no ícone de ajuda.

No Edge ou Chrome no PC, use **Instalar app** quando aparecer no painel ou a opção de instalação no menu do navegador. O app abre em janela própria. Mantenha o servidor NexDeck e o OBS em execução para usar os controles.

## Celular pela rede local

O inicializador já abre em modo de rede local. Pelo terminal, execute `npm.cmd run setup` na primeira vez e `npm.cmd start -- --lan` para abrir o painel. No PC, conecte o OBS. A etapa **Parear o celular** mostra o QR automaticamente. Escolha o IPv4 da rede compartilhada com o celular e escaneie. Ao reiniciar o servidor, pareie de novo. Use apenas em uma rede de confiança e mantenha o QR dentro dela.

## Instalar como PWA no Android

No celular, o PWA usa HTTPS. Prepare o certificado para o IPv4 do computador na rede do celular. O exemplo usa `10.0.2.6`. Use o seu endereço se for diferente.

```powershell
npm.cmd run pwa:prepare -- 10.0.2.6
npm.cmd start -- --pwa=10.0.2.6
```

O primeiro comando usa o OpenSSL do Git para Windows, quando disponível. Os arquivos ficam em `%LOCALAPPDATA%\NexDeck\pwa`, fora do projeto. O endereço do celular será `https://10.0.2.6:3443` e o painel do computador continua em `http://127.0.0.1:3000`. O OBS e o NexDeck precisam permanecer abertos para controlar a sessão.

1. No computador, na etapa **Parear o celular**, baixe o **certificado NexDeck** e transfira apenas o arquivo `NexDeck-CA.cer` para o Android.
2. No Android, procure **Instalar certificado** em **Configurações → Segurança e privacidade → Mais configurações de segurança**. Escolha **Certificado CA** e selecione o arquivo. Os nomes podem variar conforme o aparelho.
3. Conecte o OBS pelo painel no computador. No celular, escaneie o novo QR e abra no Chrome. O endereço começa com `https://`.
4. No Chrome, abra **⋮ → Instalar e criar atalho → Instalar**. Depois abra o NexDeck pelo ícone na tela inicial.

As preferências são guardadas por endereço. Ao passar de HTTP para HTTPS, configure a aparência no novo endereço. O pareamento continua no app após fechar e reabrir. Quando o servidor reiniciar, escaneie o novo QR se o app pedir. Se o IP mudar ou o certificado vencer, prepare um novo certificado e instale a nova CA no Android.

O modo `--lan` também está disponível para uso no navegador. Para usar um certificado próprio, configure `NEXDECK_TLS_CERT` e `NEXDECK_TLS_KEY` no modo `--lan`. As portas padrão podem ser alteradas com `NEXDECK_PORT`, `NEXDECK_PWA_PORT` e `NEXDECK_OBS_PORT`.

## Desenvolvimento

`npm.cmd run check` verifica a sintaxe. O servidor e a interface usam JavaScript sem etapa de compilação. Os ícones são do [Font Awesome Free](https://fontawesome.com/license/free), servidos pelo próprio NexDeck.
