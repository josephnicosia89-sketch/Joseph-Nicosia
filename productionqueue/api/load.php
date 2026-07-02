<?php
/**
 * Empire Safe — Production Queue :: LOAD endpoint
 *
 * Accepts ?file=<name>, validates/sanitizes it exactly like save.php (must
 * resolve inside the records directory, no path traversal), reads the file
 * server-side, and returns its full JSON content.
 *
 * Auth: HTTP Basic Auth is enforced by the site-root .htaccess.
 */

require __DIR__ . '/_common.php';

$requested = $_GET['file'] ?? '';
if ($requested === '') {
    send_json(400, ['status' => 'error', 'message' => 'Missing "file" parameter.']);
}

$safeName = sanitize_record_filename($requested);
if ($safeName === null) {
    send_json(400, ['status' => 'error', 'message' => 'Invalid filename.']);
}

$absPath = resolve_inside_records($safeName);
if ($absPath === null || !is_file($absPath)) {
    send_json(404, ['status' => 'error', 'message' => 'Record not found.']);
}

$raw = @file_get_contents($absPath);
if ($raw === false) {
    send_json(500, ['status' => 'error', 'message' => 'Could not read the record.']);
}

// Confirm it is still valid JSON before handing it back.
$decoded = json_decode($raw, true);
if (!is_array($decoded)) {
    send_json(500, ['status' => 'error', 'message' => 'The stored record is corrupt.']);
}

http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo $raw;
