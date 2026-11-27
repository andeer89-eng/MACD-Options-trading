export interface PositionReconciliationInput {
  brokerPositions: Array<{ symbol: string; qty: number | string; side?: string; asset_class?: string }>;
  orders: Array<{ clientOrderId: string; events: Array<{ eventType: string; symbol: string; payload?: Record<string, unknown> }> }>;
}

export interface PositionReconciliationRow {
  symbol: string;
  assetClass: string;
  brokerQty: number;
  ledgerNetFillQty: number;
  unexplainedQty: number;
  appFillCount: number;
  classification: 'LEDGER_NET_EQUALS_BROKER' | 'UNATTRIBUTED_OR_EXTERNAL_ACTIVITY' | 'UNEXPLAINED_VARIANCE';
}

const EPSILON = 0.000001;

export function buildPositionReconciliation(input: PositionReconciliationInput) {
  const broker = new Map<string, { qty: number; assetClass: string }>();
  for (const position of input.brokerPositions) {
    const symbol = String(position.symbol || '').trim().toUpperCase();
    const rawQty = Number(position.qty);
    if (!symbol || !Number.isFinite(rawQty)) {
      throw new Error('Broker positions contain a missing symbol or invalid quantity; reconciliation is inconclusive.');
    }
    const signedQty = position.side === 'short' ? -Math.abs(rawQty) : rawQty;
    const previous = broker.get(symbol);
    broker.set(symbol, {
      qty: (previous?.qty || 0) + signedQty,
      assetClass: String(position.asset_class || previous?.assetClass || 'unknown'),
    });
  }

  const ledger = new Map<string, { qty: number; count: number }>();
  for (const order of input.orders) {
    for (const event of order.events) {
      if (event.eventType !== 'FILL_RECORDED') continue;
      const symbol = String(event.symbol || '').trim().toUpperCase();
      const payload = event.payload || {};
      const qty = Number(payload.qty);
      const side = String(payload.side || '').toLowerCase();
      if (!symbol || !Number.isFinite(qty) || qty <= 0 ||
          !['buy', 'buy_to_cover', 'sell', 'sell_short'].includes(side)) {
        throw new Error(`Ledger contains an invalid fill for order ${order.clientOrderId}; reconciliation is inconclusive.`);
      }
      const signed = side === 'buy' || side === 'buy_to_cover' ? qty : -qty;
      const current = ledger.get(symbol) || { qty: 0, count: 0 };
      current.qty += signed;
      current.count++;
      ledger.set(symbol, current);
    }
  }

  const symbols = new Set([...broker.keys(), ...ledger.keys()]);
  const rows: PositionReconciliationRow[] = [...symbols].sort().map(symbol => {
    const brokerPosition = broker.get(symbol);
    const ledgerPosition = ledger.get(symbol);
    const brokerQty = brokerPosition?.qty || 0;
    const ledgerNetFillQty = ledgerPosition?.qty || 0;
    const unexplainedQty = Number((brokerQty - ledgerNetFillQty).toFixed(8));
    const hasLedgerFills = (ledgerPosition?.count || 0) > 0;
    const equal = Math.abs(unexplainedQty) <= EPSILON;
    const classification = equal && hasLedgerFills
      ? 'LEDGER_NET_EQUALS_BROKER' as const
      : !hasLedgerFills && Math.abs(brokerQty) > EPSILON
        ? 'UNATTRIBUTED_OR_EXTERNAL_ACTIVITY' as const
        : 'UNEXPLAINED_VARIANCE' as const;
    return {
      symbol,
      assetClass: brokerPosition?.assetClass || 'not_currently_held',
      brokerQty: Number(brokerQty.toFixed(8)),
      ledgerNetFillQty: Number(ledgerNetFillQty.toFixed(8)),
      unexplainedQty,
      appFillCount: ledgerPosition?.count || 0,
      classification,
    };
  });

  return {
    rows,
    summary: {
      symbols: rows.length,
      ledgerNetEqualsBroker: rows.filter(row => row.classification === 'LEDGER_NET_EQUALS_BROKER').length,
      unattributedOrExternalActivity: rows.filter(row => row.classification === 'UNATTRIBUTED_OR_EXTERNAL_ACTIVITY').length,
      unexplainedVariance: rows.filter(row => row.classification === 'UNEXPLAINED_VARIANCE').length,
    },
    interpretation: 'Ledger fill totals are not a complete position basis: opening holdings, manual broker activity, option exercise/assignment, transfers, and corporate actions may be absent. Classifications are provenance indicators, not proof of a broker or ledger defect.',
  };
}
