from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    videoId: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$", min_length=11, max_length=11)
    mode: Literal["audio", "video"]
    maxHeight: Literal[1080, 1440, 2160] = 1080
    profile: Literal["auto", "webm-opus", "mp4-aac"]

    def key(self):
        return (self.videoId, self.mode, self.maxHeight, self.profile)
