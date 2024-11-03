# Memi API

REST Api for memi image app built using express.js

## API Reference

#### User Signup

```http
  POST /users/signup
```

headers

```
  Content-Type: application/json
```

body

```
  {
    "username": "exampleUser",
    "password": "examplePass"
  }
```

#### User Login

```http
  POST /users/login
```

headers

```
  Content-Type: application/json
```

body

```
  {
    "username": "exampleUser",
    "password": "examplePass"
  }
```

#### Add Image

```http
  POST /images/add
```

headers

```
  Content-Type: multipart/form-data
  Authorization: Bearer <token>
```

form-data
| Parameter | Type | Description |
| :-------- | :------- | :------------------------- |
| `image` | `file` | jpg file to be uploaded |
| `title` | `string` | title of the image |
| `tags` | `array<int>` | Array of tag IDs associated with the image|

#### Get Images

```http
  Get /images/
```

headers

```
  Authorization: Bearer <token>
```

query params
| Parameter | Type | Description |
| :-------- | :------- | :------------------------- |
| `page` | `int` | page number for pagination |
| `pageSize` | `int` | number of items per page |
| `title` | `string` | search images by title|
| `sortBy` | `string` | field to sort by (date/title)|
| `order` | `string` | The order to sort (desc/asc) |
| `tagId` | `int` | only include images associated with this tag ID|

#### Add Tag

```http
  POST /tags/add
```

headers

```
  Content-Type: application/json
  Authorization: Bearer <token>
```

body

```
  {
    "tagName": "exampleTag"
  }
```

#### Get Tags

```http
  Get /tags/
```

headers

```
  Authorization: Bearer <token>
```

query params
| Parameter | Type | Description |
| :-------- | :------- | :------------------------- |
| `page` | `int` | page number for pagination |
| `pageSize` | `int` | number of items per page |
| `tagName` | `string` | search tags by tagName|

#### Get User Tags

tags associated with user uploaded images

```http
  Get /tags/user
```

headers

```
  Authorization: Bearer <token>
```
