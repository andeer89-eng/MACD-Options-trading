import { createHash } from 'node:crypto';

export type OrderIntentSource = 'MANUAL' | 'STOCK_BOT' | 'OPTION_BOT';
export type OrderIntentAssetClass = 'STOCK' | 'OPTION';
export type OrderIntentState =
  | 'CREATED'
  | 'RISK_APPROVED'
  | 'SUBMISSION_PENDING'
  | 'SUBMITTED'
  | 'UNKNOWN'
  | 'REJECTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'EXPIRED';

export class OrderIntentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderIntentValidationError';
  }
}

export interface OrderIntent {
  intentId: string;
  ownerId: string;
  clientOrderId: string;
  source: OrderIntentSource;
  assetClass: OrderIntentAssetClass;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc';
  limitPrice: number | null;
  stopPrice: number | null;
  orderClass: 'simple' | 'bracket';
  takeProfitLimitPrice: number | null;
  stopLossStopPrice: number | null;
  stopLossLimitPrice: number | null;
  createdAt: string;
}

export function createOrderIntent(input: {
  ownerId: string;
  source: OrderIntentSource;
  order: Record<string, unknown>;
  now?: number;
}): OrderIntent {
  const ownerId = String(input.ownerId || '').trim();
  const clientOrderId = String(input.order.client_order_id || '').trim();
  const symbol = String(input.order.symbol || '').trim().toUpperCase();
  const side = String(input.order.side || '');
  const type = String(input.order.type || '');
  const qty = Number(input.order.qty);
  const timeInForce = String(input.order.time_in_force || 'day');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) throw new OrderIntentValidationError('Verified owner UID is required for an order intent.');
  if (!clientOrderId || clientOrderId.length > 128) throw new OrderIntentValidationError('A stable client_order_id is required for every order intent.');
  if (!/^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol) && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    throw new OrderIntentValidationError('Order intent symbol is invalid.');
  }
  if (side !== 'buy' && side !== 'sell') throw new OrderIntentValidationError('Order intent side must be buy or sell.');
  if (!Number.isFinite(qty) || qty <= 0) throw new OrderIntentValidationError('Order intent quantity must be positive.');
  if (!['market', 'limit', 'stop', 'stop_limit'].includes(type)) throw new OrderIntentValidationError('Order intent type is invalid.');
  if (timeInForce !== 'day' && timeInForce !== 'gtc') throw new OrderIntentValidationError('Order intent time_in_force is invalid.');

  const assetClass: OrderIntentAssetClass = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol) ? 'OPTION' : 'STOCK';
  if (input.source === 'STOCK_BOT' && assetClass !== 'STOCK') {
    throw new OrderIntentValidationError('STOCK_BOT cannot create OPTION intents.');
  }
  if (input.source === 'OPTION_BOT' && assetClass !== 'OPTION') {
    throw new OrderIntentValidationError('OPTION_BOT cannot create STOCK intents.');
  }

  const limitPrice = input.order.limit_price === undefined ? null : Number(input.order.limit_price);
  const stopPrice = input.order.stop_price === undefined ? null : Number(input.order.stop_price);
  const orderClass = String(input.order.order_class || 'simple');
  const takeProfitLimitPrice = input.order.take_profit && typeof input.order.take_profit === 'object'
    ? Number((input.order.take_profit as Record<string, unknown>).limit_price)
    : null;
  const stopLossStopPrice = input.order.stop_loss && typeof input.order.stop_loss === 'object'
    ? Number((input.order.stop_loss as Record<string, unknown>).stop_price)
    : null;
  const stopLossLimitRaw = input.order.stop_loss && typeof input.order.stop_loss === 'object'
    ? (input.order.stop_loss as Record<string, unknown>).limit_price
    : undefined;
  const stopLossLimitPrice = stopLossLimitRaw === undefined ? null : Number(stopLossLimitRaw);
  if (orderClass !== 'simple' && orderClass !== 'bracket') {
    throw new OrderIntentValidationError('Order intent order_class is invalid.');
  }
  if (orderClass === 'bracket' &&
      (!Number.isFinite(takeProfitLimitPrice) || Number(takeProfitLimitPrice) <= 0 ||
       !Number.isFinite(stopLossStopPrice) || Number(stopLossStopPrice) <= 0)) {
    throw new OrderIntentValidationError('Bracket intents require positive take-profit and stop-loss prices.');
  }
  if (stopLossLimitPrice !== null && (!Number.isFinite(stopLossLimitPrice) || stopLossLimitPrice <= 0)) {
    throw new OrderIntentValidationError('Order intent stop-loss limit price must be positive.');
  }
  if (limitPrice !== null && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
    throw new OrderIntentValidationError('Order intent limit_price must be positive.');
  }
  if (stopPrice !== null && (!Number.isFinite(stopPrice) || stopPrice <= 0)) {
    throw new OrderIntentValidationError('Order intent stop_price must be positive.');
  }

  const intentId = createHash('sha256').update(`${ownerId}:${clientOrderId}`).digest('hex');
  return {
    intentId,
    ownerId,
    clientOrderId,
    source: input.source,
    assetClass,
    symbol,
    side,
    qty,
    type: type as OrderIntent['type'],
    timeInForce: timeInForce as OrderIntent['timeInForce'],
    limitPrice,
    stopPrice,
    orderClass: orderClass as OrderIntent['orderClass'],
    takeProfitLimitPrice: Number.isFinite(takeProfitLimitPrice) ? takeProfitLimitPrice : null,
    stopLossStopPrice: Number.isFinite(stopLossStopPrice) ? stopLossStopPrice : null,
    stopLossLimitPrice,
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
  };
}

const ALLOWED_TRANSITIONS: Record<OrderIntentState | 'NONE', readonly OrderIntentState[]> = {
  // Broker-reconciled legacy orders may enter the index without a prior intent event.
  NONE: ['CREATED', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'],
  CREATED: ['RISK_APPROVED', 'SUBMITTED', 'UNKNOWN', 'REJECTED'],
  RISK_APPROVED: ['SUBMISSION_PENDING', 'UNKNOWN', 'REJECTED'],
  SUBMISSION_PENDING: ['SUBMITTED', 'UNKNOWN', 'REJECTED'],
  UNKNOWN: ['RISK_APPROVED', 'SUBMISSION_PENDING', 'SUBMITTED', 'UNKNOWN', 'REJECTED'],
  SUBMITTED: ['SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'],
  FILLED: ['FILLED'],
  CANCELED: ['CANCELED'],
  REJECTED: ['REJECTED'],
  EXPIRED: ['EXPIRED'],
};

export function canTransitionOrderIntent(
  currentState: string | null | undefined,
  nextState: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, nextState)) return false;
  const current = currentState && Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, currentState)
    ? currentState as OrderIntentState
    : 'NONE';
  return ALLOWED_TRANSITIONS[current].includes(nextState as OrderIntentState);
}
