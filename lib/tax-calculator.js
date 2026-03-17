const calculateSummary = (invoices, settings) => {
  let ausgangsumsaetze_19 = 0;
  let ausgangsumsaetze_7 = 0;
  let ust_19 = 0;
  let ust_7 = 0;
  let vorsteuer = 0;

  invoices.forEach(inv => {
    if (inv.direction === 'out') {
      if (inv.vat_rate === 19) {
        ausgangsumsaetze_19 += inv.net_amount;
        ust_19 += inv.vat_amount;
      } else if (inv.vat_rate === 7) {
        ausgangsumsaetze_7 += inv.net_amount;
        ust_7 += inv.vat_amount;
      }
    } else if (inv.direction === 'in') {
      vorsteuer += inv.vat_amount;
    }
  });

  const zahllast = (ust_19 + ust_7) - vorsteuer;

  const periodLabel = settings ? `${settings.voranmeldezeitraum === 'monthly' ? 'Monat' : 'Quartal'}` : 'Voranmeldung';

  return {
    period: periodLabel,
    kz81: { label: "Lieferungen/Leistungen 19% (Kz 81)", value: ausgangsumsaetze_19.toFixed(2), description: "Nettobetrag aller Ausgangsrechnungen mit 19% USt" },
    kz81_steuer: { label: "Steuer auf Kz 81", value: ust_19.toFixed(2) },
    kz86: { label: "Lieferungen/Leistungen 7% (Kz 86)", value: ausgangsumsaetze_7.toFixed(2) },
    kz86_steuer: { label: "Steuer auf Kz 86", value: ust_7.toFixed(2) },
    kz66: { label: "Abziehbare Vorsteuer (Kz 66)", value: vorsteuer.toFixed(2), description: "Gezahlte USt aus Eingangsrechnungen" },
    kz83: { label: "Verbleibende Vorauszahlung (Kz 83)", value: zahllast.toFixed(2), description: "Zahllast = (Kz81 Steuer + Kz86 Steuer) - Kz66" }
  };
};

module.exports = {
  calculateSummary
};
