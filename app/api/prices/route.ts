
import { NextResponse } from 'next/server';

type QuoteResult = {
  symbol: string;
  price: number | null;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const { tickers } = (await request.json()) as { tickers: string[] };

    const API_KEY = process.env.ALPHAVANTAGE_API_KEY;

    if (!API_KEY) {
      return NextResponse.json({ error: 'Missing ALPHAVANTAGE_API_KEY' }, { status: 500 });
    }

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const uniqueTickers = Array.from(
      new Set(
        tickers
          .map((ticker) => String(ticker || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    console.log('Received tickers:', uniqueTickers);

    const results: QuoteResult[] = [];

    for (const symbol of uniqueTickers) {
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
          symbol
        )}&apikey=${API_KEY}`;

        console.log(`Fetching ${symbol}...`);
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();

        console.log(`Raw response for ${symbol}:`, json);

        if (json.Note) {
          results.push({
            symbol,
            price: null,
            error: 'Rate limit reached',
          });
          continue;
        }

        if (json['Error Message']) {
          results.push({
            symbol,
            price: null,
            error: json['Error Message'],
          });
          continue;
        }

        const quote = json['Global Quote'];
        const rawPrice = quote?.['05. price'];
        const parsedPrice = rawPrice ? Number(rawPrice) : NaN;

        if (Number.isFinite(parsedPrice)) {
          results.push({
            symbol,
            price: parsedPrice,
          });
        } else {
          results.push({
            symbol,
            price: null,
            error: 'No valid price returned',
          });
        }
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
        results.push({
          symbol,
          price: null,
          error: 'Fetch failed',
        });
      }
    }

    console.log('Final results:', results);

    return NextResponse.json({
      quotes: results,
      provider: 'Alpha Vantage',
    });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
