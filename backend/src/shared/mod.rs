pub mod jwt;

#[derive(Clone, Debug)]
pub enum CanvasDataEvent {
    RightChanged(
        /*canvas_id*/ String,
        (/*user_id*/ String, /*right*/ Option<String>),
    ),
    ModeratedChanged(/*canvas_id*/ String, /*moderated*/ bool),
}
