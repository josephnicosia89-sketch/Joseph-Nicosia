<?php
/**
 * Empire Safe — Production Queue :: LIST endpoint
 *
 * Returns a JSON array of saved records with enough metadata to browse them
 * without downloading full payloads: filename, sales order #, model, serial,
 * savedAt timestamp, and version number. Reads happen server-side; the
 * (large, photo-bearing) data blocks are never returned here.
 *
 * Auth: HTTP Basic Auth is enforced by the site-root .htaccess.
 */

require __DIR__ . '/_common.php';

$dir = records_dir();
if (!is_dir($dir)) {
    // No saves yet is not an error.
    send_json(200, ['status' => 'ok', 'records' => []]);
}

$out = [];
$files = @scandir($dir) ?: [];
foreach ($files as $f) {
    if ($f === '.' || $f === '..') continue;
    if (!preg_match('/\.json$/i', $f)) continue; // skip .htaccess, temp files, etc.

    $path = $dir . DIRECTORY_SEPARATOR . $f;
    if (!is_file($path)) continue;

    $raw = @file_get_contents($path);
    if ($raw === false) continue;
    $rec = json_decode($raw, true);
    if (!is_array($rec)) continue;

    $data   = isset($rec['data']) && is_array($rec['data']) ? $rec['data'] : [];
    $fields = isset($data['fields']) && is_array($data['fields']) ? $data['fields'] : $data;

    $out[] = [
        'fileName' => $rec['fileName']    ?? $f,
        'soNumber' => $rec['soNumber']    ?? ($fields['so_num'] ?? ''),
        'model'    => $rec['model']       ?? ($fields['model']  ?? ''),
        'serial'   => $rec['serial']      ?? ($fields['serial'] ?? ''),
        'savedAt'  => $rec['savedAt']     ?? null,
        'version'  => $rec['fileVersion'] ?? null,
    ];
}

// Newest first (fall back to filename when timestamps are equal/missing).
usort($out, function ($a, $b) {
    $c = strcmp((string)($b['savedAt'] ?? ''), (string)($a['savedAt'] ?? ''));
    return $c !== 0 ? $c : strcmp((string)($b['fileName'] ?? ''), (string)($a['fileName'] ?? ''));
});

send_json(200, ['status' => 'ok', 'records' => $out]);
