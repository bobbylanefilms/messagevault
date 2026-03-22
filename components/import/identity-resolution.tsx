// ABOUTME: Identity resolution step — maps extracted participant names to canonical records.
// ABOUTME: Handles "Who is Me?" detection, existing participant matching, and new participant creation.

"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { getParticipantColor } from "@/lib/participant-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, ArrowRight, Loader2 } from "lucide-react";

interface IdentityResolutionProps {
  participantNames: string[];
  onComplete: (participantMap: Record<string, string>) => void;
  onCancel: () => void;
}

export function IdentityResolution({
  participantNames,
  onComplete,
  onCancel,
}: IdentityResolutionProps) {
  const currentUser = useQuery(api.users.currentUser);
  const existingParticipants = useQuery(api.participants.list);
  const resolveParticipants = useMutation(api.participants.resolveForImport);

  const [meSelection, setMeSelection] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect "Me" from realName
  useMemo(() => {
    if (currentUser?.realName && !meSelection && participantNames.length > 0) {
      const match = participantNames.find(
        (name) => name.toLowerCase() === currentUser.realName.toLowerCase()
      );
      if (match) setMeSelection(match);
    }
  }, [currentUser, participantNames, meSelection]);

  // Match existing participants by name
  type Participant = NonNullable<typeof existingParticipants>[number];
  const existingMatches = useMemo(() => {
    if (!existingParticipants) return new Map<string, Participant>();
    const matches = new Map<string, Participant>();
    for (const name of participantNames) {
      const match = existingParticipants.find(
        (p) =>
          p.displayName.toLowerCase() === name.toLowerCase() ||
          p.aliases.some((a) => a.toLowerCase() === name.toLowerCase())
      );
      if (match) matches.set(name, match);
    }
    return matches;
  }, [participantNames, existingParticipants]);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const colorOffset = existingParticipants?.length ?? 0;
      let newColorIndex = 0;

      const resolutionArray = participantNames.map((name) => {
        const isMe = name === meSelection;
        const existingMatch = existingMatches.get(name);

        if (existingMatch) {
          return {
            extractedName: name,
            action: "link" as const,
            isMe,
            existingParticipantId: existingMatch._id,
            displayName: existingMatch.displayName,
            avatarColor: existingMatch.avatarColor,
          };
        }

        const color = getParticipantColor(colorOffset + newColorIndex);
        newColorIndex++;
        return {
          extractedName: name,
          action: "create" as const,
          isMe,
          displayName: isMe ? (currentUser?.realName ?? name) : name,
          avatarColor: color,
        };
      });

      const participantMap = await resolveParticipants({ resolutions: resolutionArray });
      onComplete(participantMap);
    } catch (err) {
      console.error("Failed to resolve participants:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Show loading while data loads
  if (!currentUser || existingParticipants === undefined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Identity Resolution
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Map the names found in the export to participant records.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Who is Me? */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Who is &ldquo;Me&rdquo; in this conversation?</label>
          <div className="flex flex-wrap gap-2">
            {participantNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setMeSelection(name)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  meSelection === name
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                )}
              >
                {name}
                {meSelection === name && (
                  <UserCheck className="ml-1.5 inline h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>
          {currentUser.realName && meSelection && (
            <p className="text-xs text-muted-foreground">
              Matched to your profile: {currentUser.realName}
            </p>
          )}
        </div>

        {/* Participant list */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Participants</label>
          {participantNames.map((name) => {
            const existing = existingMatches.get(name);
            const isMe = name === meSelection;
            return (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={isMe ? "default" : "secondary"}>
                    {isMe ? "Me" : name}
                  </Badge>
                  {isMe && name !== currentUser.realName && (
                    <span className="text-xs text-muted-foreground">→ {currentUser.realName}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {existing ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <UserCheck className="h-3 w-3" />
                      Linked to existing
                    </span>
                  ) : (
                    "New participant"
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!meSelection || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 h-4 w-4" />
            )}
            Start Import
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
