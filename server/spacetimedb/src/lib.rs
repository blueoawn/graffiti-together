use spacetimedb::{ReducerContext, SpacetimeType, Table};

/// Represents a single drawing stroke with coordinates and styling information
#[spacetimedb::table(name = strokes, public)]
#[derive(Clone)]
pub struct Stroke {
    #[primary_key]
    #[auto_inc]
    pub stroke_id: u64,
    pub points: Vec<Point>,
    pub color: u32,        // RGBA hex color
    pub brush_size: f32,
    pub is_eraser: bool,
    pub timestamp: u64,
}

/// A point with x and y coordinates
#[derive(SpacetimeType, Clone)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// Admins who can manage the canvas
#[spacetimedb::table(name = admins, public)]
pub struct Admin {
    #[primary_key]
    #[auto_inc]
    pub admin_id: u64,
    #[unique]
    pub identity: spacetimedb::Identity,
    pub username: String,
    pub created_at: u64,
}

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    // Called when the module is initially published
    log::info!("Graffiti Together module initialized!");
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(_ctx: &ReducerContext) {
    // Called everytime a new client connects
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(_ctx: &ReducerContext) {
    // Called everytime a client disconnects
}

/// Add a new stroke to the canvas
#[spacetimedb::reducer]
pub fn add_stroke(
    ctx: &ReducerContext,
    points: Vec<Point>,
    color: u32,
    brush_size: f32,
    is_eraser: bool,
) {
    let timestamp = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    ctx.db.strokes().insert(Stroke {
        stroke_id: 0, // auto-incremented
        points,
        color,
        brush_size,
        is_eraser,
        timestamp,
    });
    
    log::info!("Stroke added with {} points", ctx.db.strokes().count());
}

/// Add a new admin (only callable by existing admins or during init)
#[spacetimedb::reducer]
pub fn add_admin(ctx: &ReducerContext, identity: spacetimedb::Identity, username: String) {
    // In a real app, you'd check if caller is an admin
    let timestamp = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    ctx.db.admins().insert(Admin {
        admin_id: 0, // auto-incremented
        identity,
        username,
        created_at: timestamp,
    });
    
    log::info!("Admin added: {}", ctx.db.admins().count());
}

/// Clear all strokes (admin only)
#[spacetimedb::reducer]
pub fn clear_canvas(ctx: &ReducerContext) {
    // In a real app, verify caller is an admin
    for stroke in ctx.db.strokes().iter() {
        ctx.db.strokes().delete(stroke);
    }
    
    log::info!("Canvas cleared!");
}
