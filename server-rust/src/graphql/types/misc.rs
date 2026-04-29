//! Small leaf types that don't fit into a larger domain file.

use async_graphql::{SimpleObject, ID};

#[derive(SimpleObject, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

#[derive(SimpleObject, Clone)]
pub struct SettingEntry {
    pub key: String,
    pub value: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanUpdate {
    pub scanning: bool,
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanProgress {
    pub scanning: bool,
    pub library_id: Option<ID>,
    pub done: Option<i32>,
    pub total: Option<i32>,
}
