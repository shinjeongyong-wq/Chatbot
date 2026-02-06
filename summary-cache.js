/**
 * Summary Cache Manager
 * Session-based document summary caching
 */

class SummaryCacheManager {
    constructor() {
        this.enabled = true;
        this.pendingSummaries = new Map();
        console.log('[SummaryCache] Initialized');
    }

    getSessionId() {
        return window.currentSessionId || localStorage.getItem('currentSessionId');
    }

    async getCachedSummary(docId) {
        if (!this.enabled) return null;

        const sessionId = this.getSessionId();
        if (!sessionId) return null;

        try {
            const { data, error } = await supabaseClient
                .from('session_doc_summaries')
                .select('*')
                .eq('session_id', sessionId)
                .eq('doc_id', docId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('[SummaryCache] Query error:', error);
                return null;
            }

            if (data) {
                console.log('[SummaryCache] Cache hit:', docId);
                return data;
            }

            return null;
        } catch (err) {
            console.error('[SummaryCache] Query failed:', err);
            return null;
        }
    }

    async getCachedSummaries(docIds) {
        if (!this.enabled || docIds.length === 0) return new Map();

        const sessionId = this.getSessionId();
        if (!sessionId) return new Map();

        try {
            const { data, error } = await supabaseClient
                .from('session_doc_summaries')
                .select('*')
                .eq('session_id', sessionId)
                .in('doc_id', docIds);

            if (error) {
                console.error('[SummaryCache] Batch query error:', error);
                return new Map();
            }

            const resultMap = new Map();
            (data || []).forEach(item => {
                resultMap.set(item.doc_id, item);
            });

            const hitCount = resultMap.size;
            const missCount = docIds.length - hitCount;
            console.log('[SummaryCache] Batch query:', hitCount, 'hits,', missCount, 'misses');

            return resultMap;
        } catch (err) {
            console.error('[SummaryCache] Batch query failed:', err);
            return new Map();
        }
    }

    async saveSummary(docInfo, summary, paragraphs = null) {
        if (!this.enabled) return;

        const sessionId = this.getSessionId();
        if (!sessionId) {
            console.warn('[SummaryCache] No session ID - cannot save');
            return;
        }

        try {
            const insertData = {
                session_id: sessionId,
                doc_id: docInfo.id,
                doc_source: docInfo.source || 'unknown',
                original_question: docInfo.question || '',
                original_length: docInfo.answer ? docInfo.answer.length : 0,
                summary: summary,
                summary_length: summary.length
            };

            if (paragraphs && paragraphs.length > 0) {
                insertData.paragraphs = paragraphs;
            }

            console.log('[SummaryCache] Saving:', insertData.doc_id);

            const { error } = await supabaseClient
                .from('session_doc_summaries')
                .upsert(insertData, { onConflict: 'session_id,doc_id' });

            if (error) {
                console.error('[SummaryCache] Save error:', error);
                return;
            }

            console.log('[SummaryCache] Saved:', docInfo.id, '(' + summary.length + ' chars)');
        } catch (err) {
            console.error('[SummaryCache] Save failed:', err);
        }
    }

    async generateAndSaveSummaryAsync(doc) {
        if (!this.enabled || this.pendingSummaries.has(doc.id)) return;

        this.pendingSummaries.set(doc.id, true);

        setTimeout(async () => {
            try {
                console.log('[SummaryCache] Background summary generation:', doc.id);

                const summary = await this.generateSummary(doc);
                if (summary) {
                    await this.saveSummary(doc, summary.text, summary.paragraphs);
                } else {
                    console.warn('[SummaryCache] Summary generation failed:', doc.id);
                }
            } catch (err) {
                console.error('[SummaryCache] Background summary error:', err);
            } finally {
                this.pendingSummaries.delete(doc.id);
            }
        }, 100);
    }

    async generateSummary(doc) {
        const isNotion = doc.source === 'notion';

        let prompt;
        if (isNotion) {
            prompt = 'You are a document analyst. Summarize the following document by major topics (10-15 paragraphs). Keep all numbers, amounts, and dates.\n\nDocument:\n' + doc.answer + '\n\nOutput JSON only:\n```json\n{\n  "paragraphs": [\n    { "title": "Topic title", "summary": "Summary (5-10 sentences)" }\n  ]\n}\n```';
        } else {
            prompt = 'Summarize this Q&A concisely. Keep all numbers, amounts, and dates.\n\nQuestion: ' + doc.question + '\nAnswer: ' + doc.answer + '\n\nSummary (3-5 sentences):';
        }

        try {
            console.log('[SummaryCache] Calling /api/summarize');

            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[SummaryCache] API error:', response.status, errorText);
                throw new Error('HTTP ' + response.status);
            }

            const result = await response.json();
            console.log('[SummaryCache] API response received');

            if (isNotion) {
                const jsonMatch = result.summary.match(/```json\n?([\s\S]*?)\n?```/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[1]);
                    const fullSummary = parsed.paragraphs.map(function (p) {
                        return '[' + p.title + '] ' + p.summary;
                    }).join('\n\n');
                    return { text: fullSummary, paragraphs: parsed.paragraphs };
                }
            }

            return { text: result.summary, paragraphs: null };
        } catch (err) {
            console.error('[SummaryCache] Summary generation error:', err);
            return null;
        }
    }

    async clearSessionCache(sessionId) {
        const targetSession = sessionId || this.getSessionId();
        if (!targetSession) return;

        try {
            const { error } = await supabaseClient
                .from('session_doc_summaries')
                .delete()
                .eq('session_id', targetSession);

            if (error) {
                console.error('[SummaryCache] Delete error:', error);
                return;
            }

            console.log('[SummaryCache] Session cache cleared:', targetSession);
        } catch (err) {
            console.error('[SummaryCache] Delete failed:', err);
        }
    }
}

window.summaryCache = new SummaryCacheManager();
