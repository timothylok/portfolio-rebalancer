
import { NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export async function POST(request: Request) {
  try {
    const { portfolioSummary } = await request.json() as { portfolioSummary: string };

    if (!portfolioSummary) {
      return NextResponse.json({ error: 'No portfolio data provided' }, { status: 400 });
    }

    const prompt = `You are a friendly, concise financial advisor. 
Analyze this portfolio rebalancing summary and give exactly 3 bullet points of advice.
Be specific with numbers. Keep each bullet point to 1-2 sentences maximum.

Portfolio Data:
${portfolioSummary}

Respond with exactly 3 bullet points starting with •`;

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error: ${text}`);
    }

    const data = await res.json() as { response: string };

    return NextResponse.json({ advice: data.response });
  } catch (err) {
    console.error('AI route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI request failed' },
      { status: 500 }
    );
  }
}
