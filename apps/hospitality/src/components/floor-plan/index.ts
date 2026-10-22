export { TableShape, type TableShapeProps } from "./TableShape";
export { TableSelectionOverlay, type TableSelectionOverlayProps } from "./TableSelectionOverlay";
export { FloorPlanCanvas, type FloorPlanCanvasProps } from "./FloorPlanCanvas";
export { AddTableDialog, type AddTableDialogProps } from "./AddTableDialog";
export {
  NewFloorPlanDialog,
  type NewFloorPlanDialogProps,
  type NewFloorPlanRequest,
} from "./NewFloorPlanDialog";
export { TemplatePicker, type TemplatePickerProps, type TemplateSelection } from "./TemplatePicker";
export { TemplateMiniPreview, type TemplateMiniPreviewProps } from "./TemplateMiniPreview";
export {
  createFloorPlanFromTemplate,
  templateLayoutJson,
  templateTableRequest,
  type RoomTemplateApi,
} from "./apply-room-template";
export {
  ROOM_SIZES,
  ROOM_TEMPLATES,
  roomSizeById,
  roomTemplateById,
  type RoomLayout,
  type RoomSize,
  type RoomSizeId,
  type RoomTemplate,
  type RoomTemplateId,
  type RoomTemplateSection,
  type RoomTemplateTable,
} from "./room-templates";
export { perimeterGaps, tableBounds, type PerimeterGap, type PerimeterSide } from "./room-geometry";
