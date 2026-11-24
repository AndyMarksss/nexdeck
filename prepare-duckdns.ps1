param(
    [Parameter(Mandatory = $true)][string]$Domain,
    [Parameter(Mandatory = $true)][string]$LocalAddress,
    [string]$Email,
    [string]$LegoPath = (Join-Path $env:LOCALAPPDATA 'NexDeck\tools\lego-v5.7.0\lego.exe')
)

$ErrorActionPreference = 'Stop'
$Domain = $Domain.Trim().ToLowerInvariant()
if ($Domain -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$') {
    throw 'Informe seu subdominio completo do DuckDNS.'
}
$ip = [System.Net.IPAddress]::None
if (-not [System.Net.IPAddress]::TryParse($LocalAddress, [ref]$ip) -or
    $ip.ToString() -ne $LocalAddress -or $LocalAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
    throw 'Informe o IPv4 privado do PC na rede do celular.'
}
$localIps = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object OperationalStatus -eq Up |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    ForEach-Object { $_.Address.ToString() }
if ($LocalAddress -notin $localIps) { throw 'Esse IPv4 nao esta ativo neste PC.' }
if (-not (Test-Path -LiteralPath $LegoPath -PathType Leaf)) {
    $legoCommand = Get-Command lego.exe -ErrorAction SilentlyContinue
    if (-not $legoCommand) { throw 'Instale o lego ou use -LegoPath para informar o local do executavel.' }
    $LegoPath = $legoCommand.Source
}

$root = Join-Path $env:LOCALAPPDATA 'NexDeck\acme'
$certificate = Join-Path $root "certificates\$Domain.crt"
if (-not $Email) { $Email = Read-Host 'E-mail para a conta do Let''s Encrypt' }
if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Informe um e-mail valido.' }
Write-Host 'Termos do Let''s Encrypt: https://letsencrypt.org/repository/'
if ((Read-Host 'Aceita os termos do Let''s Encrypt? [S/N]') -ne 's') { exit 1 }
$previousToken = $env:DUCKDNS_TOKEN
$secureToken = Read-Host 'Cole o token do DuckDNS aqui' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $env:DUCKDNS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer).Trim()
    if (-not $env:DUCKDNS_TOKEN) { throw 'O token do DuckDNS esta vazio.' }
    $subdomain = $Domain.Split('.')[0]
    $queryToken = [Uri]::EscapeDataString($env:DUCKDNS_TOKEN)
    try {
        $result = Invoke-WebRequest -Uri "https://www.duckdns.org/update?domains=$subdomain&token=$queryToken&ip=$LocalAddress" -UseBasicParsing -TimeoutSec 20
    } catch {
        throw 'Nao foi possivel atualizar o DuckDNS. Confira a conexao com a internet e tente novamente.'
    }
    $reply = $result.Content
    if ($reply -is [byte[]]) { $reply = [Text.Encoding]::UTF8.GetString($reply) }
    if ($reply.Trim() -ne 'OK') { throw 'DuckDNS recusou a atualizacao. Confira o nome e o token.' }

    & $LegoPath run --path $root --email $Email --accept-tos --dns duckdns --dns.resolvers 1.1.1.1:53 --dns.resolvers 8.8.8.8:53 --domains $Domain
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $certificate -PathType Leaf)) {
        throw 'O lego nao concluiu a emissao do certificado.'
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $secureToken.Dispose()
    $env:DUCKDNS_TOKEN = $previousToken
}
$profile = Join-Path $root '..\duckdns.json'
$config = @{ hostname = $Domain; address = $LocalAddress } | ConvertTo-Json -Compress
[IO.File]::WriteAllText([IO.Path]::GetFullPath($profile), $config, [Text.UTF8Encoding]::new($false))
Write-Host "Certificado pronto para $Domain. Abra o NexDeck.cmd para usar o endereco."
