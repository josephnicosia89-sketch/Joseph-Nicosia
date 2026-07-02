<?php
/**
 * Empire Safe — Production Queue :: SAVE endpoint
 *
 * Accepts a raw JSON body (this app sends application/json, NOT multipart —
 * so there is no $_FILES / upload_max_filesize involved; the relevant limit is
 * post_max_size). Writes the record to /records as SO<number>_v<N>.json.
 *
 * Re-save behavior: AUTO NEW VERSION. Re-saving the same sales order writes the
 * next version (SO12345_v1.json, SO12345_v2.json, ...) and keeps every prior
 * file, so there is a full audit history and nothing is ever overwritten.
 *
 * Auth: HTTP Basic Auth is enforced by the site-root .htaccess.
 */

require __DIR__ . '/_common.php';

// ---- Method ----------------------------------------------------------------
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    send_json(405, ['status' => 'error', 'message' => 'Use POST to save a record.']);
}

// ---- Size guard (before reading the body) ----------------------------------
// If the body is larger than post_max_size, PHP discards it and php://input is
// empty. Catch that here using Content-Length so we can return a clean 413
// instead of a confusing "empty body" error.
$declaredLen = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($declaredLen > MAX_REQUEST_BYTES) {
    send_json(413, [
        'status'  => 'error',
        'message' => 'This record is too large to save (over ' . (MAX_REQUEST_BYTES / (1024 * 1024))
                   . ' MB). Remove or retake a few photos and try again.',
    ]);
}

// ---- Content-Type ----------------------------------------------------------
$ctype = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($ctype, 'application/json') === false) {
    send_json(415, ['status' => 'error', 'message' => 'Content-Type must be application/json.']);
}

// ---- Read + parse body -----------------------------------------------------
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    // Empty body after a large Content-Length usually means post_max_size was hit.
    if ($declaredLen > 0) {
        send_json(413, [
            'status'  => 'error',
            'message' => 'The record did not arrive intact (it may exceed the server upload limit). '
                       . 'Remove a few photos and try again.',
        ]);
    }
    send_json(400, ['status' => 'error', 'message' => 'Empty request body.']);
}

// Second-line defense in case Content-Length was understated.
if (strlen($raw) > MAX_REQUEST_BYTES) {
    send_json(413, ['status' => 'error', 'message' => 'This record is too large to save. Remove a few photos and try again.']);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    send_json(400, ['status' => 'error', 'message' => 'Body is not valid JSON.']);
}

// ---- Records directory (create + verify + lock down) -----------------------
[$ok, $dirOrErr] = ensure_records_dir();
if (!$ok) {
    send_json(500, ['status' => 'error', 'message' => $dirOrErr]);
}
$dir = $dirOrErr;

// ---- Derive a safe filename SERVER-SIDE (never trust client fileName) -------
// The app sends data = { fields: {...}, photos: {...} }. Read the identifying
// values out of data.fields (fall back to a flat data object just in case).
$data   = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : [];
$fields = isset($data['fields']) && is_array($data['fields']) ? $data['fields'] : $data;
$soNum  = isset($fields['so_num']) ? (string)$fields['so_num'] : '';
$model  = isset($fields['model'])  ? (string)$fields['model']  : '';
$serial = isset($fields['serial']) ? (string)$fields['serial'] : '';

$base = so_base_name($soNum); // e.g. SO12345 or NOSO_20260702_141530

// Find the next version for this base by scanning existing files.
$nextVersion = 1;
$existing = @scandir($dir) ?: [];
$pattern = '/^' . preg_quote($base, '/') . '_v(\d+)\.json$/i';
foreach ($existing as $f) {
    if (preg_match($pattern, $f, $m)) {
        $n = (int)$m[1];
        if ($n >= $nextVersion) $nextVersion = $n + 1;
    }
}

$safeName = sanitize_record_filename($base . '_v' . $nextVersion . '.json');
if ($safeName === null) {
    send_json(400, ['status' => 'error', 'message' => 'Could not build a safe filename from this record.']);
}
$absPath = resolve_inside_records($safeName);
if ($absPath === null) {
    send_json(400, ['status' => 'error', 'message' => 'Refusing to write outside the records directory.']);
}

// ---- Compose the stored record (original data preserved for load/applyData) -
$serverSavedAt = gmdate('Y-m-d\TH:i:s\Z');
$record = [
    'type'         => $payload['type']    ?? 'EmpireTDR_Checklist',
    'schemaVersion'=> $payload['version'] ?? 1,
    'fileName'     => $safeName,
    'fileVersion'  => $nextVersion,
    'soNumber'     => $soNum,
    'model'        => $model,
    'serial'       => $serial,
    'savedAt'      => $serverSavedAt,
    'clientSavedAt'=> $payload['savedAt'] ?? null,
    'data'         => $data,
];

$json = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($json === false) {
    send_json(500, ['status' => 'error', 'message' => 'Could not encode the record for saving.']);
}

// Write atomically: temp file in the same dir, then rename.
$tmp = $absPath . '.tmp' . bin2hex(random_bytes(4));
if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
    send_json(500, ['status' => 'error', 'message' => 'Failed to write the record to disk.']);
}
if (!@rename($tmp, $absPath)) {
    @unlink($tmp);
    send_json(500, ['status' => 'error', 'message' => 'Failed to finalize the saved record.']);
}

// ---- Success ---------------------------------------------------------------
send_json(200, [
    'status'   => 'ok',
    'message'  => 'Saved to the Production Queue server as ' . $safeName . '.',
    'fileName' => $safeName,
    'version'  => $nextVersion,
    'savedAt'  => $serverSavedAt,
]);
