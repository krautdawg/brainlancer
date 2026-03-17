async function loadInvoices() {
    try {
        const response = await fetch('/api/vat/invoices');
        const invoices = await response.json();
        renderInvoices(invoices);
        loadSummary();
    } catch (err) {
        console.error('Failed to load invoices:', err);
    }
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoiceTableBody');
    tbody.innerHTML = invoices.map(inv => `
        <tr class="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
            <td class="py-3 text-slate-300">${inv.date}</td>
            <td class="py-3 font-medium text-white">${inv.vendor_name}</td>
            <td class="py-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${inv.direction === 'in' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}">
                    ${inv.direction === 'in' ? 'Eingang' : 'Ausgang'}
                </span>
            </td>
            <td class="py-3 text-right text-slate-300">${inv.net_amount.toFixed(2)} €</td>
            <td class="py-3 text-right text-slate-400">${inv.vat_rate}%</td>
            <td class="py-3 text-right text-slate-300">${inv.vat_amount.toFixed(2)} €</td>
            <td class="py-3 text-right font-bold text-white">${inv.gross_amount.toFixed(2)} €</td>
            <td class="py-3 text-right">
                <button onclick="deleteInvoice(${inv.id})" class="text-slate-500 hover:text-red-400 transition p-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteInvoice(id) {
    if (!confirm('Rechnung wirklich löschen?')) return;
    try {
        await fetch(`/api/vat/invoices/${id}`, { method: 'DELETE' });
        loadInvoices();
    } catch (err) {
        alert('Fehler beim Löschen');
    }
}

async function loadSummary() {
    try {
        const response = await fetch('/api/vat/summary');
        if (!response.ok) return;
        const data = await response.json();
        
        document.getElementById('elsterPeriod').textContent = `Umsatzsteuer-Voranmeldung [${data.period}]`;
        document.getElementById('kz81_val').textContent = `${data.kz81.value.replace('.', ',')} €`;
        document.getElementById('kz86_val').textContent = `${data.kz86.value.replace('.', ',')} €`;
        document.getElementById('kz66_val').textContent = `${data.kz66.value.replace('.', ',')} €`;
        
        const kz83_el = document.getElementById('kz83_val');
        kz83_el.textContent = `${data.kz83.value.replace('.', ',')} €`;
        
        const zahllast = parseFloat(data.kz83.value);
        if (zahllast > 0) {
            kz83_el.className = 'text-2xl font-black text-red-500';
        } else if (zahllast < 0) {
            kz83_el.className = 'text-2xl font-black text-green-500';
        } else {
            kz83_el.className = 'text-2xl font-black text-white';
        }
    } catch (err) {
        console.error('Failed to load summary:', err);
    }
}

function copyToClipboard(id) {
    const text = document.getElementById(id).textContent.replace(' €', '').replace(',', '.');
    navigator.clipboard.writeText(text);
    const btn = event.currentTarget;
    const originalText = btn.textContent;
    btn.textContent = 'KOPIERT!';
    setTimeout(() => btn.textContent = originalText, 2000);
}

// Event Listeners
document.getElementById('vatSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const res = await fetch('/api/vat/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            alert('Einstellungen gespeichert');
            loadInvoices();
        }
    } catch (err) {
        alert('Fehler beim Speichern');
    }
});

document.getElementById('scanGmailBtn').addEventListener('click', async () => {
    const progress = document.getElementById('scanProgress');
    progress.classList.remove('hidden');
    
    const setStep = (step, status) => {
        const el = document.getElementById(`scan-step-${step}`);
        const icon = el.querySelector('span');
        if (status === 'loading') {
            icon.textContent = '●';
            icon.className = 'mr-3 text-green-500 animate-pulse';
            el.className = 'flex items-center text-white text-sm';
        } else {
            icon.textContent = '✓';
            icon.className = 'mr-3 text-green-500';
            el.className = 'flex items-center text-slate-300 text-sm';
        }
    };

    setStep(1, 'loading');
    setTimeout(() => setStep(1, 'done'), 1500);
    setTimeout(() => setStep(2, 'loading'), 1600);

    try {
        const response = await fetch('/api/vat/scan');
        if (response.status === 401) {
            window.location.href = '/auth/google';
            return;
        }
        
        setStep(2, 'done');
        setStep(3, 'loading');
        
        const results = await response.json();
        setStep(3, 'done');
        
        setTimeout(() => {
            progress.classList.add('hidden');
            loadInvoices();
        }, 1000);
    } catch (err) {
        alert('Fehler beim Scan: ' + err.message);
        progress.classList.add('hidden');
    }
});

document.getElementById('fileUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('invoice', file);

    try {
        const btn = e.target.nextElementSibling;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Verarbeite Beleg...';
        btn.disabled = true;

        const response = await fetch('/api/vat/upload', {
            method: 'POST',
            body: formData
        });
        
        btn.innerHTML = originalHtml;
        btn.disabled = false;

        if (response.ok) {
            loadInvoices();
        } else {
            const err = await response.json();
            alert('Fehler: ' + err.error);
        }
    } catch (err) {
        alert('Upload fehlgeschlagen');
    }
});

// Initialize
if (window.location.search.includes('tab=vat')) {
    switchTab('vat');
} else {
    loadInvoices();
}
