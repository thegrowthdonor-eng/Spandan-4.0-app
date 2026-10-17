"use client";

import { useEffect, useState } from "react";

export type PollOption = {
  id: string;
  label: string;
  sort_order: number;
  vote_count: number | null;
};

export type PollData = {
  poll_id: string;
  question: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  show_totals: boolean;
  user_voted_option_id: string | null;
  options: PollOption[];
};

export function PollWidget({ editionId, active }: { editionId?: string; active: boolean }) {
  const [polls, setPolls] = useState<PollData[]>([]);
  const [loading, setLoading] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id?: string; text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (!editionId) return;
    const loadPolls = async () => {
      const res = await fetch(`/api/polls?editionId=${editionId}`, { cache: "no-store" });
      return res.json();
    };
    loadPolls()
      .then((data) => {
        if (data.ok && data.polls) {
          setPolls(data.polls);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [editionId]);

  async function handleVote(pollId: string, optionId: string) {
    if (!active) {
      setMessage({ id: pollId, text: "Active registration is required to vote.", isError: true });
      return;
    }
    setVotingId(pollId);
    setMessage(null);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId, optionId }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setMessage({ id: pollId, text: "Vote cast successfully!" });
        // Update local poll state
        setPolls((prev) =>
          prev.map((p) =>
            p.poll_id === pollId
              ? {
                  ...p,
                  user_voted_option_id: optionId,
                  options: p.options.map((opt) =>
                    opt.id === optionId && opt.vote_count !== null
                      ? { ...opt, vote_count: opt.vote_count + 1 }
                      : opt
                  ),
                }
              : p
          )
        );
      } else {
        setMessage({ id: pollId, text: data.error ?? "Failed to cast vote.", isError: true });
      }
    } catch {
      setMessage({ id: pollId, text: "Network error submitting vote.", isError: true });
    } finally {
      setVotingId(null);
    }
  }

  if (loading) {
    return <p className="load-message">Checking for festival polls…</p>;
  }

  if (polls.length === 0) {
    return (
      <p className="load-message">
        No active campus polls right now. Check back during festival competitions for crowd voting.
      </p>
    );
  }

  return (
    <div className="polls-container">
      {polls.map((poll) => {
        const hasVoted = Boolean(poll.user_voted_option_id);
        const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.vote_count ?? 0), 0);
        const pollMsg = message?.id === poll.poll_id ? message : null;

        return (
          <article key={poll.poll_id} className="poll-card">
            <div className="poll-header-row">
              <span className={`poll-badge ${poll.is_open ? "open" : "closed"}`}>
                {poll.is_open ? "VOTING OPEN" : "POLL CLOSED"}
              </span>
              <span className="poll-closes">
                {poll.is_open
                  ? `Closes: ${new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(poll.closes_at))}`
                  : "Final Results"}
              </span>
            </div>

            <h3 className="poll-question">{poll.question}</h3>

            {pollMsg && (
              <p className={`poll-msg ${pollMsg.isError ? "error" : "success"}`} role="status">
                {pollMsg.text}
              </p>
            )}

            <div className="poll-options-list">
              {poll.options.map((opt) => {
                const isSelected = poll.user_voted_option_id === opt.id;
                const percentage =
                  poll.show_totals && totalVotes > 0 && opt.vote_count !== null
                    ? Math.round((opt.vote_count / totalVotes) * 100)
                    : null;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`poll-option-btn ${isSelected ? "selected" : ""} ${hasVoted ? "voted-mode" : ""}`}
                    disabled={!poll.is_open || hasVoted || votingId === poll.poll_id}
                    onClick={() => handleVote(poll.poll_id, opt.id)}
                  >
                    <div className="option-label-row">
                      <span className="opt-title">
                        {isSelected && <strong className="check-icon">✓ </strong>}
                        {opt.label}
                      </span>
                      {percentage !== null && (
                        <span className="opt-percent">{percentage}% ({opt.vote_count})</span>
                      )}
                    </div>
                    {percentage !== null && (
                      <div className="option-bar" style={{ width: `${percentage}%` }} />
                    )}
                  </button>
                );
              })}
            </div>

            {hasVoted && (
              <p className="poll-voted-note">
                ✓ Your vote has been officially recorded. Thank you for participating!
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
