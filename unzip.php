<?php
/**
 * Web Bulk Mailer - HTTP Unzip Utility
 * 
 * Este script extrai o arquivo mailler-deploy.zip no servidor da hospedagem compartilhada
 * diretamente pelo navegador, sem necessidade de ferramentas SSH ou painéis com unzip.
 * 
 * Instruções:
 * 1. Envie este arquivo "unzip.php" e o arquivo "mailler-deploy.zip" para o mesmo diretório na sua hospedagem.
 * 2. Acesse http://mailler.dentalgo.com.br/unzip.php no seu navegador.
 * 3. Após a extração bem sucedida, o script tentará se auto-excluir por segurança.
 */

header('Content-Type: text/html; charset=utf-8');
echo '<body style="background: #070913; color: #f3f4f6; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px;">';
echo '<div style="background: rgba(17, 22, 40, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); max-width: 550px; width: 100%; padding: 30px; box-sizing: border-box;">';
echo '<div style="text-align: center; margin-bottom: 20px;">';
echo '<div style="background: linear-gradient(135deg, #6366f1, #8b5cf6, #d946ef); width: 60px; height: 60px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4); margin-bottom: 15px;">📦</div>';
echo '<h2 style="margin: 0; font-size: 1.5em; background: linear-gradient(to right, #ffffff, #9ca3af); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Extrator de Pacotes Web</h2>';
echo '<p style="color: #6b7280; margin: 5px 0 0; font-size: 0.9em;">Descompactação rápida via HTTP (ZipArchive)</p>';
echo '</div>';

$zipFile = 'mailler-deploy.zip';
$extractTo = './';

// 1. Valida se o arquivo zip existe
if (!file_exists($zipFile)) {
    echo '<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-bottom: 20px; text-align: center;">';
    echo '❌ Erro: O arquivo <strong>' . $zipFile . '</strong> não foi encontrado neste diretório.<br>';
    echo 'Certifique-se de fazer o upload do ZIP no mesmo local deste script.';
    echo '</div>';
    echo '</div></body>';
    exit;
}

// 2. Verifica se a extensão Zip do PHP está instalada
if (!class_exists('ZipArchive')) {
    echo '<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-bottom: 20px; text-align: center;">';
    echo '❌ Erro: A extensão <strong>ZipArchive</strong> do PHP está desabilitada nesta hospedagem.';
    echo '</div>';
    echo '</div></body>';
    exit;
}

// 3. Executa a extração
$zip = new ZipArchive;
$res = $zip->open($zipFile);

if ($res === TRUE) {
    echo '<div style="color: #9ca3af; font-size: 0.95em; line-height: 1.5; margin-bottom: 20px;">';
    echo '✓ Arquivo ZIP localizado.<br>';
    echo '✓ Iniciando descompactação de todos os arquivos do Web Bulk Mailer...<br>';
    
    $zip->extractTo($extractTo);
    $numFiles = $zip->numFiles;
    $zip->close();
    
    echo '<br><span style="color: #10b981; font-weight: bold; font-size: 1.1em;">✅ Extração concluída com sucesso!</span><br>';
    echo '⚡ ' . $numFiles . ' arquivos extraídos na raiz da hospedagem.<br>';
    echo '</div>';
    
    echo '<div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 15px; border-radius: 8px; font-size: 0.85em; margin-bottom: 20px;">';
    echo '⚠️ <strong>Medida de Segurança:</strong> É fundamental deletar o arquivo ZIP e este extrator imediatamente.';
    echo '</div>';

    // 4. Auto-exclusão do unzip.php
    if (unlink(__FILE__)) {
        echo '<div style="color: #3b82f6; font-size: 0.9em; font-weight: 500; text-align: center; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05);">';
        echo '🛡️ Este arquivo <strong>unzip.php</strong> foi auto-excluído com sucesso por segurança!';
        echo '</div>';
    } else {
        echo '<div style="color: #ef4444; font-size: 0.9em; font-weight: 500; text-align: center; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05);">';
        echo '⚠️ Não foi possível auto-excluir este script automaticamente. Por favor, remova o arquivo <strong>unzip.php</strong> manualmente.';
        echo '</div>';
    }
} else {
    echo '<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 15px; border-radius: 8px; font-size: 0.9em; text-align: center;">';
    echo '❌ Falha ao descompactar o arquivo. Código de erro: ' . $res;
    echo '</div>';
}

echo '</div>';
echo '</body>';
