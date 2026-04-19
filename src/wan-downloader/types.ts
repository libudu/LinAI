export interface TaskInput {
  subType: string;
  modelVersion: string;
  prompt: string;
  baseImage: string;
  assistInfo: string;
  resolution: string;
  selectedResolution: string;
  displayResolution: string;
  duration: number;
  generationMode: string;
  multiShots: string;
  videoSoundSwitch: string;
  startTimeStamp: number;
  endTimeStamp: number;
  videoExt: boolean;
}

export interface TaskResult {
  resourceId: string;
  ossPath: string;
  url: string;
  urlWithoutLogo: string;
  resizeUrl: string;
  isSecurity: boolean;
  taskId: string;
  vagueUrl: string;
  downloadUrl: string;
  downloadUrlWithLogo: string;
  videoFirstFrameUrl: string;
  isCollected: boolean;
  squareSubmissionStatus: string;
  noWaterMark: boolean;
  resizeUrlWithoutLogo: string;
  resolution: string;
  musicCover: string;
}

export interface TaskData {
  id: number;
  gmtCreate: string;
  gmtCreateTimeStamp: number;
  taskId: string;
  dashTraceId: string;
  status: number; // -1: in progress, 2: success
  taskInput: TaskInput;
  taskType: string;
  taskResult?: TaskResult[];
  taskRate?: number;
  memberLevelList: any[];
  groupKey: string;
  mediaType: string;
  createScene: string;
}

export interface PagingListResponse {
  success: boolean;
  httpCode: number;
  errorCode: string;
  errorMsg?: string;
  data: TaskData[];
}

export interface ImageGenResponse {
  success: boolean;
  httpCode: number;
  errorCode: string;
  errorMsg?: string;
  data?: string; // taskId
  requestId: string;
  failed: boolean;
  traceId: string;
}
