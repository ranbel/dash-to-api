document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('container');
  const clearBtn = document.getElementById('clear-btn');
  const placeholderHTML = '<div class="placeholder">Waiting for /api/v4/ (Accounts/Zones) requests...</div>';

  clearBtn.addEventListener('click', () => {
    container.innerHTML = placeholderHTML;
  });

  chrome.devtools.network.onRequestFinished.addListener(request => {
    const fullUrl = request.request.url;
    const method = request.request.method;

    if (fullUrl.includes("/api/v4/accounts/") || fullUrl.includes("/api/v4/zone")) {
      const placeholder = container.querySelector('.placeholder');
      if (placeholder) placeholder.remove();

      const card = document.createElement('div');
      card.className = 'request-card';

      // 1. Generate the <APIRequest /> string
      const apiRequestString = generateAPIRequestComponent(request.request);

      const methodColors = {
        'GET': '#81c995', 'POST': '#8ab4f8', 'PUT': '#fdd663', 
        'PATCH': '#f8ad6d', 'DELETE': '#f28b82'
      };
      const color = methodColors[method] || '#fff';

      let bodyText = '';
      let bodyHtml = '';
      if (method !== 'GET' && request.request.postData && request.request.postData.text) {
        bodyText = request.request.postData.text;
        try {
          const parsed = JSON.parse(bodyText);
          bodyHtml = `<div class="header-label">Payload</div><pre>${JSON.stringify(parsed, null, 2)}</pre>`;
        } catch (e) {
          bodyHtml = `<div class="header-label">Payload</div><pre>${bodyText}</pre>`;
        }
      }

      card.innerHTML = `
        <div>
          <span class="method" style="color: ${color}">${method}</span>
          <span class="url">${fullUrl}</span>
        </div>
        ${bodyHtml}
        <div class="actions">
          <button class="copy-btn btn-url">Copy URL</button>
          ${bodyText ? '<button class="copy-btn btn-payload">Copy Payload</button>' : ''}
          <button class="copy-btn btn-apirequest" style="border-color: #f8ad6d; color: #f8ad6d;">Copy as APIRequest</button>
        </div>
      `;

      // Event Listeners
      card.querySelector('.btn-url').onclick = () => copyToClipboard(fullUrl);
      if (bodyText) {
        card.querySelector('.btn-payload').onclick = () => copyToClipboard(bodyText);
      }
      card.querySelector('.btn-apirequest').onclick = () => copyToClipboard(apiRequestString);

      container.insertBefore(card, container.firstChild);
    }
  });
});

/**
 * Transforms a Chrome Request object into a Cloudflare <APIRequest /> string
 */
function generateAPIRequestComponent(req) {
  const urlObj = new URL(req.url);
  
  // Extract path starting after /api/v4/
  let path = urlObj.pathname;
  const pathMatch = path.match(/\/api\/v4\/(.*)/);
  if (pathMatch) {
    path = "/" + pathMatch[1];
  }

  // Replace account and zone IDs with placeholders
  path = path.replace(/\/accounts\/[a-f0-9]{32}/, '/accounts/{account_id}');
  path = path.replace(/\/zones\/[a-f0-9]{32}/, '/zones/{zone_id}');

  // Replace remaining UUIDs and 32-char hex IDs with named placeholders
  // derived from the preceding path segment
  const idPattern = /\/([a-z][a-z0-9_-]*)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32})(?=\/|$)/gi;
  path = path.replace(idPattern, (match, segment, id) => {
    if (segment.startsWith('{')) return match;
    const name = singularize(segment).replace(/-/g, '_');
    return `/${segment}/{${name}_id}`;
  });

  let lines = [`<APIRequest`];
  lines.push(`  path="${path}"`);
  lines.push(`  method="${req.method}"`);

  // Handle Query Parameters (params={{}})
  if (urlObj.searchParams.toString()) {
    const params = {};
    urlObj.searchParams.forEach((value, key) => { params[key] = value; });
    lines.push(`  params={{`);
    lines.push(`    ${JSON.stringify(params, null, 4).slice(1, -1).trim()}`);
    lines.push(`  }}`);
  }

  // Handle JSON Payload (json={{}})
  if (req.postData && req.postData.text) {
    try {
      const parsed = JSON.parse(req.postData.text);
      // Format with indentation and double-curlies
      lines.push(`  json={{`);
      lines.push(`    ${JSON.stringify(parsed, null, 4).slice(1, -1).trim()}`);
      lines.push(`  }}`);
    } catch (e) {
      // Fallback for non-json or malformed
    }
  }

  lines.push(`/>`);
  return lines.join('\n');
}

/**
 * Naive singularization for path segments.
 * Handles common English plural patterns found in API paths.
 */
function singularize(word) {
  if (word.endsWith('ies') && word.length > 3) {
    return word.slice(0, -3) + 'y';       // policies -> policy, entries -> entry
  }
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
      word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2);              // addresses -> address, boxes -> box
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);              // rules -> rule, devices -> device
  }
  return word;                             // policy, staff (no change)
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    const activeBtn = document.activeElement;
    const originalText = activeBtn.innerText;
    activeBtn.innerText = 'Copied!';
    setTimeout(() => activeBtn.innerText = originalText, 1000);
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
}